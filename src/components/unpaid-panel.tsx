import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Money } from "@/components/money";
import { billDue, billLabel, billStatus, type Bill, type BillType } from "@/lib/bills";
import { cn } from "@/lib/cn";
import { formatDay, formatINR, todayISO } from "@/lib/format";
import { useLedger, useUi } from "@/lib/store";

const TITLES: Record<BillType, string> = {
  sale: "Payment to collect",
  purchase: "Unpaid purchases",
  expense: "Unpaid expenses",
};

/**
 * Everything still due on one tab, oldest first, with one-tap "Pay" (the full
 * balance, today, with Undo) and "Part" for a part payment.
 */
export function UnpaidPanel({ type, bills, nameOf }: { type: BillType; bills: Bill[]; nameOf: (bill: Bill) => string }) {
  const addBillPayment = useLedger((state) => state.addBillPayment);
  const deleteBillPayment = useLedger((state) => state.deleteBillPayment);
  const openPaymentForm = useUi((state) => state.openPaymentForm);
  const [showAll, setShowAll] = useState(false);

  const unpaid = bills
    .filter((bill) => bill.type === type && billDue(bill) > 0)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.number - b.number));
  if (unpaid.length === 0) return null;

  const total = unpaid.reduce((sum, bill) => sum + billDue(bill), 0);
  const shown = showAll ? unpaid : unpaid.slice(0, 3);
  const sale = type === "sale";

  function payNow(bill: Bill) {
    const due = billDue(bill);
    const paymentId = addBillPayment(bill.id, { amount: due, date: todayISO() });
    toast.success(`${formatINR(due)} ${sale ? "received from" : "paid to"} ${nameOf(bill)}`, {
      action: { label: "Undo", onClick: () => deleteBillPayment(bill.id, paymentId) },
    });
  }

  return (
    <section
      className={cn(
        "mt-3 overflow-hidden rounded-2xl border bg-surface",
        sale ? "border-get/30" : "border-give/30",
      )}
    >
      <div className={cn("flex items-center justify-between gap-3 px-4 py-3", sale ? "bg-get-soft" : "bg-give-soft")}>
        <div className="flex items-center gap-2">
          <AlertCircle className={cn("size-5", sale ? "text-get" : "text-give")} aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-ink">{TITLES[type]}</p>
            <p className="text-xs text-muted">
              {unpaid.length} bill{unpaid.length === 1 ? "" : "s"} · oldest first
            </p>
          </div>
        </div>
        <Money value={total} tone={sale ? "get" : "give"} className="text-xl" />
      </div>
      {shown.map((bill) => {
        const due = billDue(bill);
        return (
          <div key={bill.id} className="flex items-center gap-3 border-t border-line px-4 py-3">
            <Link to="/bill/$billId" params={{ billId: bill.id }} className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{nameOf(bill)}</span>
              <span className="block truncate text-xs text-muted">
                {billLabel(bill)} · {formatDay(bill.date)}
                {billStatus(bill) === "partly" ? " · part paid" : ""}
              </span>
              <Money value={due} tone={sale ? "get" : "give"} className="text-base" />
            </Link>
            <div className="flex shrink-0 flex-col items-stretch gap-1">
              <button
                type="button"
                onClick={() => payNow(bill)}
                className={cn(
                  "h-9 rounded-xl px-4 text-sm font-bold text-bg",
                  sale ? "bg-get" : "bg-brass",
                )}
              >
                {sale ? "Received" : "Pay"}
              </button>
              <button
                type="button"
                onClick={() => openPaymentForm(bill.id)}
                className="h-7 rounded-lg text-xs font-semibold text-muted"
              >
                Part
              </button>
            </div>
          </div>
        );
      })}
      {unpaid.length > 3 ? (
        <button
          type="button"
          onClick={() => setShowAll((value) => !value)}
          className="w-full border-t border-line py-2.5 text-sm font-semibold text-brass"
        >
          {showAll ? "Show less" : `Show all ${unpaid.length}`}
        </button>
      ) : null}
    </section>
  );
}
