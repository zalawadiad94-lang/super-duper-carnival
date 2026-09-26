import { useMemo, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ChevronRight, FilePlus2, Search } from "lucide-react";
import { Money } from "@/components/money";
import { Button, EmptyState, PageIntro, TextInput } from "@/components/ui";
import {
  BILL_META,
  BILL_TYPES,
  STATUS_META,
  billDue,
  billLabel,
  billStatus,
  type Bill,
  type BillStatus,
  type BillType,
} from "@/lib/bills";
import { cn } from "@/lib/cn";
import { formatDay, formatMonth, monthKey, todayISO } from "@/lib/format";
import { useLedger, useUi } from "@/lib/store";

type BillsSearch = { tab?: BillType };

export const Route = createFileRoute("/bills")({
  validateSearch: (search: Record<string, unknown>): BillsSearch =>
    BILL_TYPES.includes(search.tab as BillType) ? { tab: search.tab as BillType } : {},
  component: BillsPage,
});

const STATUS_FILTERS: { id: "all" | BillStatus; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unpaid", label: "Unpaid" },
  { id: "partly", label: "Part paid" },
  { id: "paid", label: "Paid" },
];

function sortBills(bills: Bill[]) {
  return [...bills].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    if (a.number !== b.number) return b.number - a.number;
    return a.createdAt < b.createdAt ? 1 : -1;
  });
}

function BillsPage() {
  const { tab = "sale" } = Route.useSearch();
  const navigate = Route.useNavigate();
  const bills = useLedger((state) => state.bills);
  const parties = useLedger((state) => state.parties);
  const openBillForm = useUi((state) => state.openBillForm);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]["id"]>("all");

  const today = todayISO();
  const month = monthKey(today);
  const partyName = useMemo(() => {
    const names = new Map(parties.map((party) => [party.id, party.name]));
    return (bill: Bill) => (bill.partyId ? names.get(bill.partyId) : undefined) ?? bill.partyName;
  }, [parties]);

  const totals = useMemo(() => {
    const monthly: Record<BillType, number> = { sale: 0, purchase: 0, expense: 0 };
    let todayIn = 0;
    let todayOut = 0;
    for (const bill of bills) {
      if (bill.date.startsWith(month)) monthly[bill.type] += bill.amount;
      for (const payment of bill.payments) {
        if (payment.date !== today) continue;
        if (bill.type === "sale") todayIn += payment.amount;
        else todayOut += payment.amount;
      }
    }
    return { monthly, todayIn, todayOut };
  }, [bills, month, today]);

  const tabBills = useMemo(() => bills.filter((bill) => bill.type === tab), [bills, tab]);
  const due = tabBills.reduce((sum, bill) => sum + billDue(bill), 0);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sortBills(tabBills).filter((bill) => {
      if (status !== "all" && billStatus(bill) !== status) return false;
      if (!q) return true;
      return (
        partyName(bill).toLowerCase().includes(q) ||
        bill.note.toLowerCase().includes(q) ||
        String(bill.number) === q.replace(/^#/, "") ||
        String(bill.amount).includes(q)
      );
    });
  }, [tabBills, query, status, partyName]);

  const meta = BILL_META[tab];

  return (
    <div className="mx-auto max-w-3xl pb-16 lg:pb-0">
      <div className="mb-1 flex items-end justify-between gap-3">
        <PageIntro title="Bills" lede={`This month, ${formatMonth(month)}`} />
        <Button className="mb-4 hidden shrink-0 lg:inline-flex" onClick={() => openBillForm(tab)}>
          <FilePlus2 className="size-4" aria-hidden="true" />
          Add bill
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {BILL_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => navigate({ search: { tab: type }, replace: true })}
            className={cn(
              "rounded-2xl border bg-surface px-3 py-3 text-left",
              tab === type ? "border-brass" : "border-line",
            )}
          >
            <Money value={totals.monthly[type]} tone={type === "sale" ? "get" : "give"} className="block truncate text-lg" />
            <span className="text-xs text-muted">{type === "sale" ? "Sales" : type === "purchase" ? "Purchases" : "Expenses"}</span>
          </button>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3">
        <div className="flex gap-6">
          <div>
            <Money value={totals.todayIn} tone="get" className="block text-lg" />
            <span className="text-xs text-muted">Today's in</span>
          </div>
          <div>
            <Money value={totals.todayOut} tone="give" className="block text-lg" />
            <span className="text-xs text-muted">Today's out</span>
          </div>
        </div>
        <Link to="/reports" className="inline-flex items-center gap-1 text-sm font-semibold text-brass">
          Cashbook
          <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      </div>

      <div role="tablist" className="mt-4 grid grid-cols-3 rounded-xl bg-ink p-1">
        {BILL_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            role="tab"
            aria-selected={tab === type}
            onClick={() => navigate({ search: { tab: type }, replace: true })}
            className={cn(
              "h-10 rounded-lg text-sm font-semibold",
              tab === type ? "bg-brass text-bg" : "text-bg/80",
            )}
          >
            {BILL_META[type].tab}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-col gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
          <TextInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Search ${meta.tab.toLowerCase()} bills — name, no., details`}
            className="pl-10"
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {STATUS_FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setStatus(item.id)}
                className={cn(
                  "h-9 shrink-0 rounded-full px-3 text-sm font-semibold",
                  status === item.id ? "bg-ink text-bg" : "border border-line bg-surface text-ink",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          {due > 0 ? (
            <p className="shrink-0 text-right text-xs text-muted">
              {tab === "sale" ? "To collect" : "To pay"}
              <Money value={due} tone={tab === "sale" ? "get" : "give"} className="block text-base" />
            </p>
          ) : null}
        </div>
      </div>

      {tabBills.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title={`No ${meta.tab.toLowerCase()} bills yet`}
            body={
              tab === "sale"
                ? "Raise an invoice for work done. With a party picked, it goes into their khata too."
                : tab === "purchase"
                  ? "Note material bills from suppliers, paid or on credit."
                  : "Diesel, tea, rent, lab tests — the small costs that add up."
            }
            action={<Button onClick={() => openBillForm(tab)}>Add bill</Button>}
          />
        </div>
      ) : rows.length === 0 ? (
        <p className="mt-6 text-sm text-muted">Nothing matches.</p>
      ) : (
        <div className="mt-3 overflow-hidden rounded-2xl border border-line bg-surface">
          {rows.map((bill) => {
            const state = billStatus(bill);
            return (
              <Link
                key={bill.id}
                to="/bill/$billId"
                params={{ billId: bill.id }}
                className="flex items-start gap-3 border-b border-line px-4 py-3 last:border-b-0"
              >
                <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full bg-brass-soft text-brass">
                  <FilePlus2 className="size-5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{partyName(bill)}</span>
                  <span className="mt-1 inline-block rounded-md border border-line px-1.5 py-0.5 text-xs text-muted">
                    {billLabel(bill)}
                  </span>
                  <span className="mt-1 block text-xs text-muted">{formatDay(bill.date)}</span>
                </span>
                <span className="shrink-0 text-right">
                  <Money value={bill.amount} className="block text-lg" />
                  <span className={cn("text-sm font-semibold", STATUS_META[state].className)}>
                    {STATUS_META[state].label}
                  </span>
                  {state === "partly" ? (
                    <span className="block text-xs text-muted">
                      Due <Money value={billDue(bill)} className="text-xs" />
                    </span>
                  ) : null}
                </span>
              </Link>
            );
          })}
        </div>
      )}

      <button
        type="button"
        onClick={() => openBillForm(tab)}
        className="fixed bottom-20 right-4 z-20 flex h-14 items-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold text-bg shadow-lg lg:hidden"
      >
        <FilePlus2 className="size-5" aria-hidden="true" />
        Add bill
      </button>
    </div>
  );
}
