import { useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { PageIntro } from "@/components/ui";
import { Money } from "@/components/money";
import { formatMonth, monthKey, recentMonths, todayISO } from "@/lib/format";
import { KIND_META, balanceLabel, bookTotals, cashInRange, partyBalance, type EntryKind } from "@/lib/model";
import { useLedger } from "@/lib/store";
import { cn } from "@/lib/cn";

export const Route = createFileRoute("/reports")({ component: ReportsPage });

function ReportsPage() {
  const parties = useLedger((state) => state.parties);
  const sites = useLedger((state) => state.sites);
  const entries = useLedger((state) => state.entries);
  const months = recentMonths(6);
  const [month, setMonth] = useState(monthKey(todayISO()));
  const cash = cashInRange(entries, month);
  const totals = bookTotals(parties, entries);
  const monthEntries = entries.filter((entry) => entry.date.startsWith(month));

  const byKind = new Map<EntryKind, number>();
  for (const entry of monthEntries) {
    byKind.set(entry.kind, (byKind.get(entry.kind) ?? 0) + entry.amount);
  }
  const kindRows = [...byKind.entries()].sort((a, b) => b[1] - a[1]);
  const maxKind = kindRows.reduce((max, row) => Math.max(max, row[1]), 1);

  const open = parties
    .map((party) => ({ party, balance: partyBalance(entries, party.id) }))
    .filter((item) => Math.abs(item.balance.net) > 0.001)
    .sort((a, b) => Math.abs(b.balance.net) - Math.abs(a.balance.net));

  const siteRows = sites.map((site) => {
    const tagged = monthEntries.filter((entry) => entry.siteId === site.id);
    const cashOut = tagged
      .filter((entry) => KIND_META[entry.kind].cash && KIND_META[entry.kind].direction === "gave")
      .reduce((sum, entry) => sum + entry.amount, 0);
    const billed = tagged.filter((entry) => entry.kind === "bill").reduce((sum, entry) => sum + entry.amount, 0);
    return { site, cashOut, billed, count: tagged.length };
  }).filter((row) => row.count > 0);

  return (
    <div className="flex flex-col gap-5">
      <PageIntro title="Reports" lede="Cash that moved, and balances still open." />

      <div className="flex gap-2 overflow-x-auto pb-1">
        {months.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setMonth(key)}
            className={cn(
              "h-10 shrink-0 rounded-full px-4 text-sm font-semibold",
              month === key ? "bg-ink text-bg" : "border border-line bg-surface text-ink",
            )}
          >
            {formatMonth(key).split(" ")[0]}
          </button>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <section className="rounded-2xl border border-line bg-surface p-4">
          <p className="text-sm text-muted">Cash in</p>
          <Money value={cash.cashIn} tone="get" className="mt-1 block text-2xl" />
          <p className="mt-1 text-xs text-muted">Payments you actually received</p>
        </section>
        <section className="rounded-2xl border border-line bg-surface p-4">
          <p className="text-sm text-muted">Cash out</p>
          <Money value={cash.cashOut} tone="give" className="mt-1 block text-2xl" />
          <p className="mt-1 text-xs text-muted">Wages, advances, supplier payments</p>
        </section>
        <section className="rounded-2xl border border-line bg-surface p-4">
          <p className="text-sm text-muted">{cash.net >= 0 ? "Cash left this month" : "Cash short this month"}</p>
          <Money value={Math.abs(cash.net)} tone={cash.net >= 0 ? "get" : "give"} className="mt-1 block text-2xl" />
          <p className="mt-1 text-xs text-muted">Bills stay on the khata. They are not cash.</p>
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
      <section>
        <h2 className="mb-2 text-sm font-semibold text-muted">What moved in {formatMonth(month)}</h2>
        {kindRows.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line bg-surface px-4 py-6 text-sm text-muted">No entries this month.</p>
        ) : (
          <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
            {kindRows.map(([kind, amount]) => (
              <div key={kind}>
                <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium">{KIND_META[kind].label}</span>
                  <Money value={amount} tone={KIND_META[kind].direction === "gave" ? "give" : "get"} />
                </div>
                <div className="h-2 rounded-full bg-line">
                  <div
                    className={KIND_META[kind].direction === "gave" ? "h-2 rounded-full bg-give" : "h-2 rounded-full bg-get"}
                    style={{ width: `${Math.max(6, (amount / maxKind) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-muted">Sites this month</h2>
        {siteRows.length === 0 ? (
          <p className="text-sm text-muted">No site-tagged entries.</p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-line bg-surface">
            {siteRows.map((row) => (
              <Link
                key={row.site.id}
                to="/site/$siteId"
                params={{ siteId: row.site.id }}
                className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 last:border-b-0"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{row.site.name}</span>
                  <span className="text-xs text-muted">Billed {new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(row.billed)}</span>
                </span>
                <span className="text-right">
                  <Money value={row.cashOut} tone="give" className="block text-lg" />
                  <span className="text-xs text-muted">Cash out</span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
      </div>

      <section>
        <div className="mb-2 flex items-end justify-between gap-3">
          <h2 className="text-sm font-semibold text-muted">Open balances</h2>
          <p className="text-xs text-muted">
            Net {totals.net >= 0 ? "in your favour" : "you owe"}{" "}
            <Money value={Math.abs(totals.net)} tone={totals.net >= 0 ? "get" : "give"} />
          </p>
        </div>
        {open.length === 0 ? (
          <p className="text-sm text-muted">Nothing outstanding.</p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-line bg-surface">
            {open.map((item) => {
              const label = balanceLabel(item.balance.net);
              return (
                <Link
                  key={item.party.id}
                  to="/party/$partyId"
                  params={{ partyId: item.party.id }}
                  className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 last:border-b-0"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{item.party.name}</span>
                    <span className="text-xs text-muted">{label.title}</span>
                  </span>
                  <Money value={label.amount} tone={label.tone} className="text-lg" />
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
