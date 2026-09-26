import { Link, createFileRoute } from "@tanstack/react-router";
import { ChevronLeft, MessageCircle, Pencil, Phone } from "lucide-react";
import { toast } from "sonner";
import { EntryRow } from "@/components/entry-row";
import { LedgerTable } from "@/components/ledger-table";
import { Money } from "@/components/money";
import { Button } from "@/components/ui";
import { formatDay, formatINR, formatPhone, todayISO } from "@/lib/format";
import { KIND_META, ROLE_META, balanceLabel, directionOf, partyBalance, runningNets, sortEntriesDesc } from "@/lib/model";
import { useLedger, useUi } from "@/lib/store";

export const Route = createFileRoute("/party/$partyId")({ component: PartyPage });

function whatsAppHref(phone: string, text: string) {
  const digits = phone.replace(/\D/g, "");
  const num = digits.length === 10 ? `91${digits}` : digits;
  if (num.length < 10) return null;
  return `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
}

function reminderText(business: string, party: string, net: number) {
  const label = balanceLabel(net);
  const money = formatINR(label.amount);
  const line =
    label.tone === "get"
      ? `Please clear ${money}. This is what you'll get as on ${formatDay(todayISO())}.`
      : label.tone === "give"
        ? `Our khata shows ${money} still to pay you, as on ${formatDay(todayISO())}.`
        : `Our khata is settled as on ${formatDay(todayISO())}.`;
  return `${party},\n\nReminder from ${business}.\n${line}\n\nThank you.\n— ${business}`;
}

function PartyPage() {
  const { partyId } = Route.useParams();
  const parties = useLedger((state) => state.parties);
  const sites = useLedger((state) => state.sites);
  const entries = useLedger((state) => state.entries);
  const businessName = useLedger((state) => state.businessName);
  const openAdd = useUi((state) => state.openAdd);
  const openPartyForm = useUi((state) => state.openPartyForm);
  const party = parties.find((item) => item.id === partyId);

  if (!party) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="font-display text-3xl">Party not found</h1>
        <Link to="/parties" className="mt-3 inline-block text-sm font-semibold text-brass">
          Back to parties
        </Link>
      </div>
    );
  }

  const balance = partyBalance(entries, party.id);
  const label = balanceLabel(balance.net);
  const list = sortEntriesDesc(entries.filter((entry) => entry.partyId === party.id));
  const nets = runningNets(list);
  const siteById = new Map(sites.map((site) => [site.id, site]));
  const message = reminderText(businessName, party.name, balance.net);
  const wa = whatsAppHref(party.phone, message);

  return (
    <div>
      <Link to="/parties" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-muted">
        <ChevronLeft className="size-4" aria-hidden="true" />
        Parties
      </Link>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-brass">{ROLE_META[party.role].label}</p>
          <h1 className="font-display text-3xl leading-tight tracking-tight">{party.name}</h1>
          {party.note ? <p className="mt-1 text-sm text-muted">{party.note}</p> : null}
        </div>
        <button
          type="button"
          onClick={() => openPartyForm(party.id)}
          className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-line bg-surface"
          aria-label="Edit party"
        >
          <Pencil className="size-4" />
        </button>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[20rem_1fr] lg:items-start">
        <div>
          <section className="rounded-2xl border border-line bg-surface p-4">
        <p className="text-sm text-muted">{label.title}</p>
        <Money value={label.amount} tone={label.tone} className="mt-1 block text-4xl" />
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-3">
          <div>
            <p className="text-xs text-muted">You gave</p>
            <Money value={balance.gave} tone="give" className="mt-1 block text-lg" />
          </div>
          <div>
            <p className="text-xs text-muted">You got</p>
            <Money value={balance.got} tone="get" className="mt-1 block text-lg" />
          </div>
        </div>
          </section>

          <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={() => openAdd({ partyId: party.id, siteId: list.find((entry) => entry.siteId)?.siteId ?? null })}>Add entry</Button>
        {party.phone ? (
          <a
            href={`tel:${party.phone.replace(/\s/g, "")}`}
            className="inline-flex h-12 items-center gap-2 rounded-xl border border-line bg-surface px-4 text-sm font-semibold"
          >
            <Phone className="size-4" aria-hidden="true" />
            {formatPhone(party.phone)}
          </a>
        ) : null}
        <button
          type="button"
          className="inline-flex h-12 items-center gap-2 rounded-xl border border-line bg-surface px-4 text-sm font-semibold"
          onClick={() => {
            void navigator.clipboard.writeText(message).then(
              () => toast.success("Reminder copied"),
              () => toast.error("Couldn't copy the reminder"),
            );
          }}
        >
          Copy reminder
        </button>
        {wa ? (
          <a
            href={wa}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-12 items-center gap-2 rounded-xl bg-get px-4 text-sm font-semibold text-bg"
          >
            <MessageCircle className="size-4" aria-hidden="true" />
            WhatsApp
          </a>
        ) : null}
          </div>
        </div>

        <div>
          <h2 className="mb-2 text-sm font-semibold text-muted">Khata · latest first</h2>
      {list.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line bg-surface px-4 py-6 text-sm text-muted">
          No entries yet. A bill, a payment, or wages due — start with the latest one.
        </p>
      ) : (
        <>
          <div className="overflow-hidden rounded-2xl border border-line bg-surface lg:hidden">
            {list.map((entry) => (
              <div key={entry.id} className="border-b border-line last:border-b-0">
                <EntryRow
                  entry={entry}
                  site={entry.siteId ? siteById.get(entry.siteId) : undefined}
                  running={nets.get(entry.id)}
                  onClick={() => openAdd({ partyId: party.id, siteId: entry.siteId, entryId: entry.id })}
                />
              </div>
            ))}
          </div>
          <div className="hidden lg:block">
            <LedgerTable
              rows={list.map((entry) => {
                const meta = KIND_META[entry.kind];
                const gave = directionOf(entry.kind) === "gave";
                const running = nets.get(entry.id);
                return {
                  id: entry.id,
                  date: entry.date,
                  title: meta.label,
                  note: entry.note,
                  extra: entry.siteId ? siteById.get(entry.siteId)?.name : undefined,
                  gave: gave ? entry.amount : null,
                  got: gave ? null : entry.amount,
                  balance: running === undefined ? undefined : balanceLabel(running),
                  onOpen: () => openAdd({ partyId: party.id, siteId: entry.siteId, entryId: entry.id }),
                };
              })}
            />
          </div>
        </>
      )}
        </div>
      </div>
    </div>
  );
}
