import { Link, createFileRoute } from "@tanstack/react-router";
import { MapPin } from "lucide-react";
import { Button, EmptyState, PageIntro } from "@/components/ui";
import { formatINR } from "@/lib/format";
import { KIND_META } from "@/lib/model";
import { useLedger, useUi } from "@/lib/store";

export const Route = createFileRoute("/sites")({ component: SitesPage });

function SitesPage() {
  const sites = useLedger((state) => state.sites);
  const parties = useLedger((state) => state.parties);
  const entries = useLedger((state) => state.entries);
  const openSiteForm = useUi((state) => state.openSiteForm);
  const ordered = [...sites].sort((a, b) => {
    if (a.status !== b.status) return a.status === "active" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div>
      <div className="mb-4 flex items-end justify-between gap-3">
        <PageIntro title="Sites" lede="Each job you are running, with its bills and spend." />
        <Button className="mb-4 shrink-0" onClick={() => openSiteForm(null)}>
          Add
        </Button>
      </div>
      {sites.length === 0 ? (
        <EmptyState
          title="No sites yet"
          body="Name the building, road, or house you are on. Tag bills and payments to it."
          action={<Button onClick={() => openSiteForm(null)}>Add a site</Button>}
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-3">
          {ordered.map((site) => {
            const client = parties.find((party) => party.id === site.clientPartyId);
            const tagged = entries.filter((entry) => entry.siteId === site.id);
            const cashOut = tagged
              .filter((entry) => KIND_META[entry.kind].cash && KIND_META[entry.kind].direction === "gave")
              .reduce((sum, entry) => sum + entry.amount, 0);
            const billed = tagged.filter((entry) => entry.kind === "bill").reduce((sum, entry) => sum + entry.amount, 0);
            return (
              <Link key={site.id} to="/site/$siteId" params={{ siteId: site.id }} className="rounded-2xl border border-line bg-surface p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-brass">
                      {site.status === "active" ? "Active" : "Completed"}
                    </p>
                    <h2 className="mt-1 font-display text-2xl leading-tight">{site.name}</h2>
                  </div>
                </div>
                {site.location ? (
                  <p className="mt-2 flex items-center gap-1 text-sm text-muted">
                    <MapPin className="size-4 shrink-0" aria-hidden="true" />
                    <span className="truncate">{site.location}</span>
                  </p>
                ) : null}
                <p className="mt-3 text-sm">
                  <span className="text-muted">Client </span>
                  {client?.name ?? "Not linked"}
                </p>
                <p className="mt-1 text-sm text-muted">
                  Billed {formatINR(billed)} · Cash out {formatINR(cashOut)} · {tagged.length} entries
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
