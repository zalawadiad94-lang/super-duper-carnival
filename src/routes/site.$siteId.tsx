import { Link, createFileRoute } from "@tanstack/react-router";
import { ChevronLeft, Pencil } from "lucide-react";
import { EntryRow } from "@/components/entry-row";
import { LedgerTable } from "@/components/ledger-table";
import { Money } from "@/components/money";
import { Button } from "@/components/ui";
import { KIND_META, directionOf, sortEntriesDesc } from "@/lib/model";
import { useLedger, useUi } from "@/lib/store";

export const Route = createFileRoute("/site/$siteId")({ component: SitePage });

function SitePage() {
  const { siteId } = Route.useParams();
  const sites = useLedger((state) => state.sites);
  const parties = useLedger((state) => state.parties);
  const entries = useLedger((state) => state.entries);
  const openAdd = useUi((state) => state.openAdd);
  const openSiteForm = useUi((state) => state.openSiteForm);
  const site = sites.find((item) => item.id === siteId);

  if (!site) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="font-display text-3xl">Site not found</h1>
        <Link to="/sites" className="mt-3 inline-block text-sm font-semibold text-brass">
          Back to sites
        </Link>
      </div>
    );
  }

  const client = parties.find((party) => party.id === site.clientPartyId);
  const list = sortEntriesDesc(entries.filter((entry) => entry.siteId === site.id));
  const partyName = new Map(parties.map((party) => [party.id, party.name]));
  const billed = list.filter((entry) => entry.kind === "bill").reduce((sum, entry) => sum + entry.amount, 0);
  const received = list.filter((entry) => entry.kind === "receipt").reduce((sum, entry) => sum + entry.amount, 0);
  const cashOut = list
    .filter((entry) => KIND_META[entry.kind].cash && KIND_META[entry.kind].direction === "gave")
    .reduce((sum, entry) => sum + entry.amount, 0);
  const involved = [...new Set(list.map((entry) => entry.partyId))]
    .map((id) => parties.find((party) => party.id === id))
    .filter((party) => party !== undefined);

  return (
    <div>
      <Link to="/sites" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-muted">
        <ChevronLeft className="size-4" aria-hidden="true" />
        Sites
      </Link>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-brass">
            {site.status === "active" ? "Active site" : "Completed"}
          </p>
          <h1 className="font-display text-3xl leading-tight tracking-tight">{site.name}</h1>
          {site.location ? <p className="mt-1 text-sm text-muted">{site.location}</p> : null}
        </div>
        <button
          type="button"
          onClick={() => openSiteForm(site.id)}
          className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-line bg-surface"
          aria-label="Edit site"
        >
          <Pencil className="size-4" />
        </button>
      </div>

      <section className="mt-4 overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="grid grid-cols-3 divide-x divide-line">
          <Stat label="Billed" value={billed} tone="ink" />
          <Stat label="Received" value={received} tone="get" />
          <Stat label="Cash out" value={cashOut} tone="give" />
        </div>
      </section>

      {client ? (
        <Link
          to="/party/$partyId"
          params={{ partyId: client.id }}
          className="mt-3 flex items-center justify-between rounded-2xl border border-line bg-surface px-4 py-3"
        >
          <span>
            <span className="block text-xs text-muted">Client</span>
            <span className="font-medium">{client.name}</span>
          </span>
          <span className="text-sm font-semibold text-brass">Open khata</span>
        </Link>
      ) : null}

      <div className="mt-3">
        <Button onClick={() => openAdd({ siteId: site.id })}>Add entry on this site</Button>
      </div>

      {involved.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {involved.map((party) => (
            <Link
              key={party.id}
              to="/party/$partyId"
              params={{ partyId: party.id }}
              className="rounded-full border border-line bg-surface px-3 py-2 text-sm font-medium"
            >
              {party.name}
            </Link>
          ))}
        </div>
      ) : null}

      <h2 className="mb-2 mt-6 text-sm font-semibold text-muted">Entries on this site</h2>
      {list.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line bg-surface px-4 py-6 text-sm text-muted">
          Nothing tagged here yet.
        </p>
      ) : (
        <>
          <div className="overflow-hidden rounded-2xl border border-line bg-surface lg:hidden">
            {list.map((entry) => (
              <div key={entry.id} className="border-b border-line last:border-b-0">
                <p className="px-4 pt-3 text-xs font-semibold text-muted">{partyName.get(entry.partyId)}</p>
                <EntryRow
                  entry={entry}
                  onClick={() => openAdd({ partyId: entry.partyId, siteId: site.id, entryId: entry.id })}
                />
              </div>
            ))}
          </div>
          <div className="hidden lg:block">
            <LedgerTable
              showBalance={false}
              rows={list.map((entry) => {
                const meta = KIND_META[entry.kind];
                const gave = directionOf(entry.kind) === "gave";
                return {
                  id: entry.id,
                  date: entry.date,
                  title: partyName.get(entry.partyId) ?? "Party",
                  note: `${meta.label}${entry.note ? ` — ${entry.note}` : ""}`,
                  gave: gave ? entry.amount : null,
                  got: gave ? null : entry.amount,
                  onOpen: () => openAdd({ partyId: entry.partyId, siteId: site.id, entryId: entry.id }),
                };
              })}
            />
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "ink" | "get" | "give" }) {
  return (
    <div className="min-w-0 p-3">
      <p className="text-xs text-muted">{label}</p>
      <Money value={value} tone={tone} className="mt-1 block text-sm leading-tight md:text-lg" />
    </div>
  );
}
