import { BILL_META, billDue, billLabel, billPaid, billStatus, type Bill } from "@/lib/bills";
import { itemRows, renderDocument, type DocSpec } from "@/lib/doc-image";
import type { Party, Site } from "@/lib/model";

const TITLES = { sale: "Invoice", purchase: "Purchase bill", expense: "Expense voucher" } as const;
const PARTY_LABEL = { sale: "Bill to", purchase: "From (supplier)", expense: "Paid to" } as const;

/** A sale invoice, purchase bill or expense voucher as a JPEG data URL. */
export function renderBill(bill: Bill, business: string, party: Party | undefined, site: Site | undefined) {
  const paid = billPaid(bill);
  const due = billDue(bill);
  const status = billStatus(bill);
  const sale = bill.type === "sale";
  const hasLines = bill.lines.length > 0;

  const spec: DocSpec = {
    title: TITLES[bill.type],
    business,
    refLabel: `${BILL_META[bill.type].numberLabel} No.`,
    ref: billLabel(bill).replace(/^.*#/, "#"),
    date: bill.date,
    left: {
      label: PARTY_LABEL[bill.type],
      main: party?.name ?? bill.partyName,
      sub: party?.phone ? `Phone: ${party.phone}` : undefined,
    },
    right: site ? { label: "Site", main: site.name, sub: site.location || undefined } : undefined,
    columns: hasLines ? "full" : "amount",
    rows: hasLines
      ? itemRows(bill.lines, true)
      : [{ name: bill.note || BILL_META[bill.type].single, amount: bill.amount }],
    totals: [
      { label: "Total", value: bill.amount, tone: "blue", big: true },
      ...(paid > 0 ? [{ label: sale ? "Received" : "Paid", value: paid, tone: "get" as const }] : []),
      { label: "Balance due", value: due, tone: due > 0 ? ("give" as const) : ("ink" as const) },
    ],
    stamp:
      status === "paid"
        ? { text: "PAID", color: "#0c8a4c" }
        : status === "partly"
          ? { text: "PART PAID", color: "#c46a00" }
          : { text: "UNPAID", color: "#d9362b" },
    note: hasLines ? bill.note : "",
    footer: sale
      ? [due > 0 ? "Kindly pay the balance due at the earliest." : "Received with thanks.", "Thank you for your business."]
      : ["Recorded in our books.", "Thank you."],
    signature: true,
  };
  return renderDocument(spec);
}
