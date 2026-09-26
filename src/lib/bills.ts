import { daysAgo } from "@/lib/format";
import type { EntryKind, PartyRole } from "@/lib/model";

export const BILL_TYPES = ["sale", "purchase", "expense"] as const;
export type BillType = (typeof BILL_TYPES)[number];

export type BillPayment = {
  id: string;
  amount: number;
  date: string;
  /** The payment's entry in the party khata, when the bill has a party. */
  entryId: string | null;
};

export type Bill = {
  id: string;
  type: BillType;
  number: number;
  partyId: string | null;
  /** Name shown when there is no party (walk-in customer, "Diesel", …). */
  partyName: string;
  siteId: string | null;
  date: string;
  amount: number;
  note: string;
  /** The bill's entry in the party khata, when the bill has a party. */
  entryId: string | null;
  payments: BillPayment[];
  createdAt: string;
};

export const BILL_META: Record<
  BillType,
  { tab: string; single: string; numberLabel: string; nameLabel: string; namePlaceholder: string; paidWord: string }
> = {
  sale: {
    tab: "Sale",
    single: "Sale bill",
    numberLabel: "Invoice",
    nameLabel: "Customer name",
    namePlaceholder: "Walk-in customer",
    paidWord: "Received",
  },
  purchase: {
    tab: "Purchase",
    single: "Purchase bill",
    numberLabel: "Purchase",
    nameLabel: "Seller name",
    namePlaceholder: "Hardware shop",
    paidWord: "Paid",
  },
  expense: {
    tab: "Expense",
    single: "Expense",
    numberLabel: "Expense",
    nameLabel: "Expense for",
    namePlaceholder: "Diesel, tea, site office rent",
    paidWord: "Paid",
  },
};

export type BillStatus = "paid" | "partly" | "unpaid";

export function billPaid(bill: Bill) {
  return bill.payments.reduce((sum, payment) => sum + payment.amount, 0);
}

export function billDue(bill: Bill) {
  return Math.max(0, Math.round((bill.amount - billPaid(bill)) * 100) / 100);
}

export function billStatus(bill: Bill): BillStatus {
  const paid = billPaid(bill);
  if (paid >= bill.amount - 0.001) return "paid";
  if (paid > 0.001) return "partly";
  return "unpaid";
}

export const STATUS_META: Record<BillStatus, { label: string; className: string }> = {
  paid: { label: "Paid", className: "text-get" },
  partly: { label: "Part paid", className: "text-brass" },
  unpaid: { label: "Unpaid", className: "text-give" },
};

export function billLabel(bill: Pick<Bill, "type" | "number">) {
  return `${BILL_META[bill.type].numberLabel} #${bill.number}`;
}

export function nextBillNumber(bills: Bill[], type: BillType) {
  return bills.reduce((max, bill) => (bill.type === type ? Math.max(max, bill.number) : max), 0) + 1;
}

/**
 * How a bill and its payments show up in the party khata. A sale is money the
 * party owes you; a purchase or expense is money you owe them, booked with the
 * kind that fits their role.
 */
export function khataKinds(type: BillType, role: PartyRole): { bill: EntryKind; payment: EntryKind } {
  if (type === "sale") return { bill: "bill", payment: "receipt" };
  switch (role) {
    case "supplier":
      return { bill: "purchase", payment: "supplier_paid" };
    case "subcontractor":
      return { bill: "sub_bill", payment: "sub_paid" };
    case "labour":
      return { bill: "wages_due", payment: "wages_paid" };
    default:
      return { bill: "got", payment: "gave" };
  }
}

/** "Mehta Developers'", "Raju's". */
export function possessive(name: string) {
  return /s$/i.test(name) ? `${name}'` : `${name}'s`;
}

export function khataNote(bill: Pick<Bill, "type" | "number" | "note">) {
  const label = billLabel(bill);
  return bill.note ? `${label} — ${bill.note}` : label;
}

function sampleBill(
  id: string,
  type: BillType,
  number: number,
  partyId: string | null,
  partyName: string,
  siteId: string | null,
  amount: number,
  days: number,
  note: string,
  entryId: string | null,
  paid: [amount: number, days: number][] = [],
): Bill {
  const date = daysAgo(days);
  return {
    id,
    type,
    number,
    partyId,
    partyName,
    siteId,
    date,
    amount,
    note,
    entryId,
    payments: paid.map(([value, when], index) => ({
      id: `${id}-pay${index + 1}`,
      amount: value,
      date: daysAgo(when),
      entryId: null,
    })),
    createdAt: `${date}T08:00:00.000Z`,
  };
}

/** Bills matching the sample khata (entry ids from `sampleBooks`). */
export function sampleBills(): Bill[] {
  return [
    sampleBill("b-s1", "sale", 1, "p-sharma", "R.K. Sharma", "s-farm", 240000, 50, "Final bill — farmhouse complete", "e7", [[240000, 40]]),
    sampleBill("b-s2", "sale", 2, "p-mehta", "Mehta Developers", "s-green", 840000, 45, "RA bill 2 — structure up to lintel", "e1", [[500000, 32]]),
    sampleBill("b-s3", "sale", 3, "p-pwd", "PWD Rewari", "s-nh", 350000, 21, "Culvert package", "e5", [[150000, 9]]),
    sampleBill("b-s4", "sale", 4, "p-mehta", "Mehta Developers", "s-green", 620000, 14, "RA bill 3 — Block B slab", "e3", [[200000, 3]]),
    sampleBill("b-p1", "purchase", 1, "p-bharat", "Bharat Cement & Steel", "s-green", 96000, 20, "UltraTech 200 bags", "e9", [[96000, 6]]),
    sampleBill("b-p2", "purchase", 2, "p-yamuna", "Yamuna Sand Suppliers", "s-green", 54000, 18, "3 trolleys coarse sand", "e12", [[54000, 16]]),
    sampleBill("b-p3", "purchase", 3, "p-bharat", "Bharat Cement & Steel", "s-green", 90000, 11, "TMT steel 1.5 ton", "e10", [[24000, 6]]),
    sampleBill("b-p4", "purchase", 4, "p-om", "Om Electricals", "s-green", 38500, 8, "Conduit, wires, DB — Block B", "e14", [[20000, 2]]),
    sampleBill("b-x1", "expense", 1, null, "Diesel for generator", "s-green", 4500, 9, "50 litres", null, [[4500, 9]]),
    sampleBill("b-x2", "expense", 2, null, "Cube test — lab charges", "s-green", 3500, 5, "Slab concrete, 6 cubes", null),
    sampleBill("b-x3", "expense", 3, null, "Tea and snacks", null, 1200, 0, "Site office, this week", null, [[1200, 0]]),
  ];
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Read bills from a backup. Older backups have none. Links to parties, sites
 * and khata entries that aren't in the backup are dropped. Returns null when
 * the data is malformed.
 */
export function parseBills(
  value: unknown,
  ids: { parties: Set<string>; sites: Set<string>; entries: Set<string> },
): Bill[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const bills: Bill[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    if (typeof item.id !== "string" || !BILL_TYPES.includes(item.type as BillType)) return null;
    if (typeof item.amount !== "number" || !Number.isFinite(item.amount) || item.amount <= 0) return null;
    if (typeof item.date !== "string" || !DATE_RE.test(item.date)) return null;
    const payments: BillPayment[] = [];
    for (const pay of Array.isArray(item.payments) ? item.payments : []) {
      if (!isRecord(pay) || typeof pay.id !== "string") return null;
      if (typeof pay.amount !== "number" || !Number.isFinite(pay.amount) || pay.amount <= 0) return null;
      if (typeof pay.date !== "string" || !DATE_RE.test(pay.date)) return null;
      const entryId = typeof pay.entryId === "string" && ids.entries.has(pay.entryId) ? pay.entryId : null;
      payments.push({ id: pay.id, amount: pay.amount, date: pay.date, entryId });
    }
    const partyId = typeof item.partyId === "string" && ids.parties.has(item.partyId) ? item.partyId : null;
    const siteId = typeof item.siteId === "string" && ids.sites.has(item.siteId) ? item.siteId : null;
    const entryId = typeof item.entryId === "string" && ids.entries.has(item.entryId) ? item.entryId : null;
    bills.push({
      id: item.id,
      type: item.type as BillType,
      number: typeof item.number === "number" && item.number > 0 ? Math.floor(item.number) : 1,
      partyId,
      partyName: typeof item.partyName === "string" ? item.partyName : "",
      siteId,
      date: item.date,
      amount: item.amount,
      note: typeof item.note === "string" ? item.note : "",
      entryId,
      payments,
      createdAt: typeof item.createdAt === "string" ? item.createdAt : `${item.date}T08:00:00.000Z`,
    });
  }
  return bills;
}
