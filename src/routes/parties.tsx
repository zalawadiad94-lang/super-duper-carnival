import { useMemo, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { Button, EmptyState, PageIntro, TextInput } from "@/components/ui";
import { Money } from "@/components/money";
import { formatPhone } from "@/lib/format";
import { ROLE_META, balanceLabel, partyBalance, type PartyRole } from "@/lib/model";
import { useLedger, useUi } from "@/lib/store";
import { cn } from "@/lib/cn";

export const Route = createFileRoute("/parties")({ component: PartiesPage });

const FILTERS: { id: "all" | PartyRole; label: string }[] = [
  { id: "all", label: "All" },
  { id: "client", label: "Clients" },
  { id: "supplier", label: "Suppliers" },
  { id: "labour", label: "Labour" },
  { id: "subcontractor", label: "Subs" },
];

function PartiesPage() {
  const parties = useLedger((state) => state.parties);
  const entries = useLedger((state) => state.entries);
  const openPartyForm = useUi((state) => state.openPartyForm);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return parties
      .filter((party) => (filter === "all" ? true : party.role === filter))
      .filter((party) => !q || party.name.toLowerCase().includes(q) || party.phone.includes(q))
      .map((party) => ({ party, balance: partyBalance(entries, party.id) }))
      .sort((a, b) => Math.abs(b.balance.net) - Math.abs(a.balance.net) || a.party.name.localeCompare(b.party.name));
  }, [parties, entries, query, filter]);

  return (
    <div>
      <div className="mb-4 flex items-end justify-between gap-3">
        <PageIntro title="Parties" lede="Everyone you give to or get from. Click a row to open their khata." />
        <Button className="mb-4 shrink-0" onClick={() => openPartyForm(null)}>
          Add party
        </Button>
      </div>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative lg:max-w-sm lg:flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
          <TextInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name or phone" className="pl-10" />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              className={cn(
                "h-10 shrink-0 rounded-full px-4 text-sm font-semibold",
                filter === item.id ? "bg-ink text-bg" : "border border-line bg-surface text-ink",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {parties.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title="No parties yet"
            body="Start with the client of your current site, then add the supplier and the mistry."
            action={<Button onClick={() => openPartyForm(null)}>Add a party</Button>}
          />
        </div>
      ) : rows.length === 0 ? (
        <p className="mt-6 text-sm text-muted">Nothing matches that search.</p>
      ) : (
        <>
          <div className="mt-4 overflow-hidden rounded-2xl border border-line bg-surface lg:hidden">
            {rows.map(({ party, balance }) => {
              const label = balanceLabel(balance.net);
              return (
                <Link
                  key={party.id}
                  to="/party/$partyId"
                  params={{ partyId: party.id }}
                  className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 last:border-b-0"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-semibold text-bg">
                      {party.name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{party.name}</span>
                      <span className="text-xs text-muted">{ROLE_META[party.role].label}</span>
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <Money value={label.amount} tone={label.tone} className="block text-lg" />
                    <span className="text-xs text-muted">{label.title}</span>
                  </span>
                </Link>
              );
            })}
          </div>
          <div className="mt-4 hidden overflow-hidden rounded-2xl border border-line bg-surface lg:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-brass-soft text-xs font-semibold uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3 font-semibold">Party</th>
                  <th className="px-3 py-3 font-semibold">Role</th>
                  <th className="px-3 py-3 font-semibold">Phone</th>
                  <th className="px-3 py-3 text-right font-semibold">You gave</th>
                  <th className="px-3 py-3 text-right font-semibold">You got</th>
                  <th className="px-4 py-3 text-right font-semibold">Balance</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ party, balance }) => {
                  const label = balanceLabel(balance.net);
                  return (
                    <tr key={party.id} className="border-t border-line hover:bg-brass-soft">
                      <td className="px-4 py-3">
                        <Link to="/party/$partyId" params={{ partyId: party.id }} className="font-medium">
                          {party.name}
                        </Link>
                        {party.note ? <p className="text-xs text-muted">{party.note}</p> : null}
                      </td>
                      <td className="px-3 py-3 text-muted">{ROLE_META[party.role].label}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-muted">{party.phone ? formatPhone(party.phone) : "—"}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-right">
                        <Money value={balance.gave} tone="give" />
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right">
                        <Money value={balance.got} tone="get" />
                      </td>
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
        </>
      )}
    </div>
  );
}
