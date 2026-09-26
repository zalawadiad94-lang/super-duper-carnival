import { useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Button, ConfirmDialog } from "@/components/ui";
import { Money } from "@/components/money";
import { LedgerTable } from "@/components/ledger-table";
import { balanceLabel, bookTotals, cashInRange, directionOf, partyBalance, sortEntriesDesc, KIND_META } from "@/lib/model";
import { formatMonth, monthKey, todayISO } from "@/lib/format";
import { ChevronRight, PackageX } from "lucide-react";
import { formatQty } from "@/lib/bills";
import { itemStock, stockLevel } from "@/lib/stock";
import { useLedger, useUi } from "@/lib/store";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const businessName = useLedger((state) => state.businessName);
  const parties = useLedger((state) => state.parties);
  const sites = useLedger((state) => state.sites);
  const entries = useLedger((state) => state.entries);
  const showSampleHint = useLedger((state) => state.showSampleHint);
  const dismissSample = useLedger((state) => state.dismissSample);
  const clearAll = useLedger((state) => state.clearAll);
  const openAdd = useUi((state) => state.openAdd);
  const openPartyForm = useUi((state) => state.openPartyForm);
  const openSiteForm = useUi((state) => state.openSiteForm);
  const [confirmClear, setConfirmClear] = useState(false);
  const items = useLedger((state) => state.items);
  const bills = useLedger((state) => state.bills);
  const adjustments = useLedger((state) => state.stockAdjustments);
  const lowStock = items
    .map((item) => ({ item, stock: itemStock(item, bills, adjustments) }))
    .filter(({ item, stock }) => stockLevel(item, stock) !== "ok");

  const totals = bookTotals(parties, entries);
  const netLabel = balanceLabel(totals.net);
  const month = monthKey(todayISO());
  const cash = cashInRange(entries, month);
  const attention = parties
    .map((party) => ({ party, balance: partyBalance(entries, party.id) }))
    .filter((item) => Math.abs(item.balance.net) > 0.001)
    .sort((a, b) => Math.abs(b.balance.net) - Math.abs(a.balance.net));
  const recent = sortEntriesDesc(entries).slice(0, 8);
  const activeSites = sites.filter((site) => site.status === "active");
  const partyName = new Map(parties.map((party) => [party.id, party.name]));
  const siteName = new Map(sites.map((site) => [site.id, site.name]));

  if (parties.length === 0) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="font-display text-4xl leading-tight tracking-tight">Your khata is empty</h1>
        <p className="mt-2 max-w-md text-sm text-muted">
          Add the people you deal with — clients who owe you, suppliers, labour, subcontractors — then note every bill and payment the way you would in a paper book.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button onClick={() => openPartyForm(null)}>Add a party</Button>
          <Button variant="soft" onClick={() => openSiteForm(null)}>
            Add a site
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-sm font-semibold text-muted">{formatMonth(month)}</p>
        <h1 className="font-display text-3xl leading-tight tracking-tight md:text-4xl">{businessName}</h1>
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <article className="rounded-2xl border border-line border-t-4 border-t-brass bg-surface p-4">
          <p className="text-sm text-muted">You'll get</p>
          <Money value={totals.get} tone="get" className="mt-1 block text-2xl lg:text-3xl" />
        </article>
        <article className="rounded-2xl border border-line bg-surface p-4">
          <p className="text-sm text-muted">You'll give</p>
          <Money value={totals.give} tone="give" className="mt-1 block text-2xl lg:text-3xl" />
        </article>
        <article className="rounded-2xl border border-line bg-surface p-4">
          <p className="text-sm text-muted">{totals.net === 0 ? "Nothing open" : netLabel.tone === "get" ? "In your favour" : "You owe overall"}</p>
          <Money value={Math.abs(totals.net)} tone={netLabel.tone} className="mt-1 block text-2xl lg:text-3xl" />
        </article>
        <article className="rounded-2xl border border-line bg-surface p-4">
          <p className="text-sm text-muted">Cash this month</p>
          <p className="mt-1 text-sm">
            In <Money value={cash.cashIn} tone="get" />
          </p>
          <p className="text-sm">
            Out <Money value={cash.cashOut} tone="give" />
          </p>
        </article>
      </section>

      {showSampleHint ? (
        <section className="rounded-2xl border border-line bg-brass-soft px-4 py-4">
          <p className="text-sm font-semibold text-ink">Sample books for a building contractor</p>
          <p className="mt-1 text-sm text-muted">
            Clients, labour, cement, and JCB for Aarav Constructions. Replace them with your own sites whenever you are ready.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="navy" className="h-11" onClick={() => setConfirmClear(true)}>
              Use my own books
            </Button>
            <Button variant="ghost" className="h-11 border border-line bg-surface" onClick={dismissSample}>
              Keep sample
            </Button>
          </div>
        </section>
      ) : null}

      {lowStock.length ? (
        <Link
          to="/bills"
          search={{ tab: "stock" }}
          className="mb-4 flex items-center gap-3 rounded-2xl border border-warn/30 bg-warn-soft px-4 py-3"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-warn text-bg">
            <PackageX className="size-5" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-ink">
              {lowStock.length} item{lowStock.length === 1 ? "" : "s"} running low
            </span>
            <span className="block truncate text-xs text-muted">
              {lowStock.map(({ item, stock }) => `${item.name} ${formatQty(stock, item.unit)}`).join(" · ")}
            </span>
          </span>
          <ChevronRight className="size-5 shrink-0 text-warn" aria-hidden="true" />
        </Link>
      ) : null}

      <div className="grid gap-4 lg:hidden">
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted">Needs a look</h2>
            <Link to="/parties" className="text-sm font-semibold text-brass">
              All parties
            </Link>
          </div>
          <div className="overflow-hidden rounded-2xl border border-line bg-surface">
            {attention.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted">Every party is settled.</p>
            ) : (
              attention.slice(0, 4).map((item) => {
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
              })
            )}
          </div>
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted">Latest entries</h2>
            <button type="button" onClick={() => openAdd()} className="text-sm font-semibold text-brass">
              Add entry
            </button>
          </div>
          <div className="overflow-hidden rounded-2xl border border-line bg-surface">
            {recent.map((entry) => {
              const meta = KIND_META[entry.kind];
              return (
                <Link
                  key={entry.id}
                  to="/party/$partyId"
                  params={{ partyId: entry.partyId }}
                  className="flex items-start justify-between gap-3 border-b border-line px-4 py-3 last:border-b-0"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{partyName.get(entry.partyId)}</span>
                    <span className="block truncate text-xs text-muted">
                      {meta.label}
                      {entry.siteId ? ` · ${siteName.get(entry.siteId) ?? ""}` : ""}
                    </span>
                  </span>
                  <Money value={entry.amount} tone={meta.direction === "gave" ? "give" : "get"} className="text-lg" />
                </Link>
              );
            })}
          </div>
        </section>
      </div>

      <div className="hidden gap-4 lg:grid lg:grid-cols-5">
        <section className="lg:col-span-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted">Open balances</h2>
            <Link to="/parties" className="text-sm font-semibold text-brass">
              All parties
            </Link>
          </div>
          <div className="overflow-hidden rounded-2xl border border-line bg-surface">
            <table className="w-full text-left text-sm">
              <thead className="bg-brass-soft text-xs font-semibold uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3 font-semibold">Party</th>
                  <th className="px-3 py-3 font-semibold">Role</th>
                  <th className="px-4 py-3 text-right font-semibold">Balance</th>
                </tr>
              </thead>
              <tbody>
                {attention.map((item) => {
                  const label = balanceLabel(item.balance.net);
                  return (
                    <tr key={item.party.id} className="border-t border-line hover:bg-brass-soft">
                      <td className="px-4 py-3">
                        <Link to="/party/$partyId" params={{ partyId: item.party.id }} className="font-medium">
                          {item.party.name}
                        </Link>
                      </td>
                      <td className="px-3 py-3 capitalize text-muted">{item.party.role}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <Money value={label.amount} tone={label.tone} />
                        <span className="ml-2 text-xs text-muted">{label.title}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
        <section className="min-w-0 lg:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted">Latest entries</h2>
            <button type="button" onClick={() => openAdd()} className="text-sm font-semibold text-brass">
              Add entry
            </button>
          </div>
          <LedgerTable
            showBalance={false}
            rows={recent.map((entry) => {
              const meta = KIND_META[entry.kind];
              const gave = directionOf(entry.kind) === "gave";
              return {
                id: entry.id,
                date: entry.date,
                title: partyName.get(entry.partyId) ?? "Party",
                note: meta.label,
                extra: entry.siteId ? siteName.get(entry.siteId) : undefined,
                gave: gave ? entry.amount : null,
                got: gave ? null : entry.amount,
                onOpen: () => openAdd({ partyId: entry.partyId, siteId: entry.siteId, entryId: entry.id }),
              };
            })}
          />
        </section>
      </div>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted">Active sites</h2>
          <Link to="/sites" className="text-sm font-semibold text-brass">
            All sites
          </Link>
        </div>
        {activeSites.length === 0 ? (
          <button
            type="button"
            onClick={() => openSiteForm(null)}
            className="w-full rounded-2xl border border-dashed border-line bg-surface px-4 py-6 text-sm text-muted"
          >
            Add the site you are working on
          </button>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {activeSites.map((site) => {
              const client = parties.find((party) => party.id === site.clientPartyId);
              const tagged = entries.filter((entry) => entry.siteId === site.id);
              const billed = tagged.filter((entry) => entry.kind === "bill").reduce((sum, entry) => sum + entry.amount, 0);
              const received = tagged.filter((entry) => entry.kind === "receipt").reduce((sum, entry) => sum + entry.amount, 0);
              return (
                <Link key={site.id} to="/site/$siteId" params={{ siteId: site.id }} className="rounded-2xl border border-line bg-surface p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-brass">Active</p>
                  <p className="mt-1 font-display text-2xl leading-tight">{site.name}</p>
                  <p className="mt-1 text-sm text-muted">{site.location}</p>
                  <p className="mt-3 text-sm">
                    <span className="text-muted">Client </span>
                    {client?.name ?? "Not linked"}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    Billed {formatShort(billed)} · Received {formatShort(received)}
                  </p>
                </Link>
              );
            })}
          </div>
        )}
      </section>
      <ConfirmDialog
        open={confirmClear}
        title="Start your own khata?"
        body="This removes the sample parties, sites, and entries on this device. You can load the sample again from your firm name."
        confirmLabel="Clear sample"
        danger
        onOpenChange={setConfirmClear}
        onConfirm={() => {
          clearAll();
          setConfirmClear(false);
        }}
      />
    </div>
  );
}

function formatShort(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}
