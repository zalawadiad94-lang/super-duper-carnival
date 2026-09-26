import { useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, MessageCircle, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Money } from "@/components/money";
import { Button, ConfirmDialog } from "@/components/ui";
import {
  BILL_META,
  STATUS_META,
  billDue,
  billLabel,
  billPaid,
  billStatus,
  formatQty,
  lineTotal,
  possessive,
  type Bill,
} from "@/lib/bills";
import { cn } from "@/lib/cn";
import { formatDay, formatINR } from "@/lib/format";
import { useLedger, useUi } from "@/lib/store";

export const Route = createFileRoute("/bill/$billId")({ component: BillPage });

function whatsAppHref(phone: string, text: string) {
  const digits = phone.replace(/\D/g, "");
  const num = digits.length === 10 ? `91${digits}` : digits;
  if (num.length < 10) return null;
  return `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
}

function shareText(business: string, name: string, bill: Bill) {
  const due = billDue(bill);
  const lines = [
    `${name},`,
    "",
    `${billLabel(bill)} from ${business}`,
    `Date: ${formatDay(bill.date)}`,
    bill.note ? `Details: ${bill.note}` : null,
    ...bill.lines.map(
      (line) => `• ${line.name}: ${formatQty(line.qty, line.unit)} × ${formatINR(line.rate)} = ${formatINR(lineTotal(line))}`,
    ),
    `Amount: ${formatINR(bill.amount)}`,
    billPaid(bill) > 0 ? `Paid: ${formatINR(billPaid(bill))}` : null,
    due > 0 ? `Balance due: ${formatINR(due)}` : "Fully paid. Thank you.",
    "",
    `— ${business}`,
  ];
  return lines.filter((line) => line !== null).join("\n");
}

function BillPage() {
  const { billId } = Route.useParams();
  const navigate = useNavigate();
  const bills = useLedger((state) => state.bills);
  const parties = useLedger((state) => state.parties);
  const sites = useLedger((state) => state.sites);
  const businessName = useLedger((state) => state.businessName);
  const deleteBill = useLedger((state) => state.deleteBill);
  const deleteBillPayment = useLedger((state) => state.deleteBillPayment);
  const openBillForm = useUi((state) => state.openBillForm);
  const openPaymentForm = useUi((state) => state.openPaymentForm);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [removePayment, setRemovePayment] = useState<string | null>(null);
  const bill = bills.find((item) => item.id === billId);

  if (!bill) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="font-display text-3xl">Bill not found</h1>
        <Link to="/bills" className="mt-3 inline-block text-sm font-semibold text-brass">
          Back to bills
        </Link>
      </div>
    );
  }

  const party = bill.partyId ? parties.find((item) => item.id === bill.partyId) : undefined;
  const site = bill.siteId ? sites.find((item) => item.id === bill.siteId) : undefined;
  const name = party?.name ?? bill.partyName;
  const state = billStatus(bill);
  const paid = billPaid(bill);
  const due = billDue(bill);
  const meta = BILL_META[bill.type];
  const wa = party?.phone ? whatsAppHref(party.phone, shareText(businessName, name, bill)) : null;
  const payments = [...bill.payments].sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        to="/bills"
        search={{ tab: bill.type }}
        className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-muted"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
        Bills
      </Link>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-brass">
            {meta.single} · {billLabel(bill)}
          </p>
          <h1 className="font-display text-3xl leading-tight tracking-tight">
            {party ? (
              <Link to="/party/$partyId" params={{ partyId: party.id }}>
                {name}
              </Link>
            ) : (
              name
            )}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {formatDay(bill.date)}
            {site ? ` · ${site.name}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => openBillForm(bill.type, bill.id)}
          className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-line bg-surface"
          aria-label="Edit bill"
        >
          <Pencil className="size-4" />
        </button>
      </div>

      <div className="mt-4 rounded-2xl border border-line bg-surface p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-muted">Bill amount</p>
            <Money value={bill.amount} className="text-3xl" />
          </div>
          <span className={cn("rounded-full bg-bg px-3 py-1 text-sm font-semibold", STATUS_META[state].className)}>
            {STATUS_META[state].label}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 border-t border-line pt-3">
          <div>
            <p className="text-xs text-muted">{meta.paidWord}</p>
            <Money value={paid} tone="get" className="text-xl" />
          </div>
          <div>
            <p className="text-xs text-muted">Balance due</p>
            <Money value={due} tone={due > 0 ? "give" : "settled"} className="text-xl" />
          </div>
        </div>
        {bill.lines.length ? (
          <div className="mt-3 border-t border-line pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Items</p>
            {bill.lines.map((line) => (
              <div key={line.id} className="mt-2 flex items-start justify-between gap-3 text-sm">
                <span className="min-w-0">
                  <span className="block font-medium">{line.name}</span>
                  <span className="text-xs text-muted">
                    {formatQty(line.qty, line.unit)} × {formatINR(line.rate)}
                  </span>
                </span>
                <Money value={lineTotal(line)} className="shrink-0 text-base" />
              </div>
            ))}
          </div>
        ) : null}
        {bill.note ? <p className="mt-3 border-t border-line pt-3 text-sm">{bill.note}</p> : null}
        <p className="mt-3 text-xs text-muted">
          {bill.entryId && party ? `Written in ${possessive(party.name)} khata.` : "Not in any party's khata."}
        </p>
      </div>

      <div className={cn("mt-4 grid gap-2", due > 0 ? "grid-cols-2" : "grid-cols-1")}>
        {due > 0 ? (
          <Button onClick={() => openPaymentForm(bill.id)}>
            {bill.type === "sale" ? "Payment received" : "Payment made"}
          </Button>
        ) : null}
        {wa ? (
          <a
            href={wa}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-brass-soft px-4 text-sm font-semibold text-brass"
          >
            <MessageCircle className="size-4" aria-hidden="true" />
            Send on WhatsApp
          </a>
        ) : (
          <Button
            variant="soft"
            onClick={() => {
              void navigator.clipboard?.writeText(shareText(businessName, name, bill)).then(
                () => toast.success("Bill copied"),
                () => toast.error("Couldn't copy"),
              );
            }}
          >
            Copy bill
          </Button>
        )}
      </div>

      <h2 className="mt-6 font-display text-xl">Payments</h2>
      {payments.length === 0 ? (
        <p className="mt-2 text-sm text-muted">No payments yet.</p>
      ) : (
        <div className="mt-2 overflow-hidden rounded-2xl border border-line bg-surface">
          {payments.map((payment) => (
            <div key={payment.id} className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 last:border-b-0">
              <div>
                <Money value={payment.amount} tone="get" className="text-lg" />
                <p className="text-xs text-muted">{formatDay(payment.date)}</p>
              </div>
              <button
                type="button"
                onClick={() => setRemovePayment(payment.id)}
                className="flex size-10 items-center justify-center rounded-xl text-muted"
                aria-label="Remove payment"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <Button variant="danger" className="mt-6 w-full" onClick={() => setConfirmDelete(true)}>
        Delete bill
      </Button>

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${billLabel(bill)}?`}
        body={bill.entryId ? "Its lines in the party khata are removed too." : "This can't be undone."}
        confirmLabel="Delete"
        danger
        onOpenChange={setConfirmDelete}
        onConfirm={() => {
          deleteBill(bill.id);
          setConfirmDelete(false);
          toast.success("Bill deleted");
          void navigate({ to: "/bills", search: { tab: bill.type } });
        }}
      />
      <ConfirmDialog
        open={removePayment !== null}
        title="Remove this payment?"
        body="The bill goes back to showing it as due."
        confirmLabel="Remove"
        danger
        onOpenChange={(open) => {
          if (!open) setRemovePayment(null);
        }}
        onConfirm={() => {
          if (removePayment) deleteBillPayment(bill.id, removePayment);
          setRemovePayment(null);
        }}
      />
    </div>
  );
}
