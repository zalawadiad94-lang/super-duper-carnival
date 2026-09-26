import { useEffect, useMemo, useState } from "react";
import { Contact, MessageCircle, MessageSquareText, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { DrawerFrame } from "@/components/drawers";
import { Button, Field, SelectInput, TextArea, TextInput } from "@/components/ui";
import { formatQty, lineTotal, round2, type BillLine } from "@/lib/bills";
import { canPickContact, pickContact } from "@/lib/contacts";
import { cn } from "@/lib/cn";
import { formatDay, formatINR, todayISO } from "@/lib/format";
import { hasPhone, smsLink, whatsAppLink } from "@/lib/share";
import { useLedger } from "@/lib/store";

export type OrderLine = Pick<BillLine, "name" | "unit" | "qty" | "rate">;

type OrderDetails = {
  business: string;
  supplier: string;
  lines: OrderLine[];
  showRates: boolean;
  reference: string;
  deliverTo: string;
  neededBy: string;
};

function purchaseOrderText(order: OrderDetails) {
  const rows = order.lines.map((line, index) => {
    const qty = formatQty(line.qty, line.unit);
    return order.showRates && line.rate > 0
      ? `${index + 1}. ${line.name} — ${qty} @ ${formatINR(line.rate)}`
      : `${index + 1}. ${line.name} — ${qty}`;
  });
  const total = round2(order.lines.reduce((sum, line) => sum + lineTotal(line), 0));
  return [
    "*PURCHASE ORDER*",
    `From: ${order.business}`,
    order.supplier ? `To: ${order.supplier}` : null,
    `Date: ${formatDay(todayISO())}`,
    order.reference ? `Ref: ${order.reference}` : null,
    "",
    "Please send:",
    ...rows,
    order.showRates && total > 0 ? `\nTotal: ${formatINR(total)}` : null,
    order.deliverTo ? `\nDeliver to: ${order.deliverTo}` : null,
    order.neededBy ? `Needed by: ${formatDay(order.neededBy)}` : null,
    "",
    "Please confirm the order and delivery. Thank you.",
    `— ${order.business}`,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

/** Build and send a purchase order to the supplier's phone (WhatsApp or SMS). */
export function PurchaseOrderForm({
  lines,
  partyId,
  supplierName,
  siteId,
  reference,
}: {
  lines: OrderLine[];
  partyId: string | null;
  supplierName: string;
  siteId: string | null;
  reference: string;
}) {
  const businessName = useLedger((state) => state.businessName);
  const parties = useLedger((state) => state.parties);
  const sites = useLedger((state) => state.sites);
  const updateParty = useLedger((state) => state.updateParty);
  const party = partyId ? parties.find((item) => item.id === partyId) : undefined;

  const [phone, setPhone] = useState(party?.phone ?? "");
  const [showRates, setShowRates] = useState(false);
  const [site, setSite] = useState(siteId ?? "");
  const [neededBy, setNeededBy] = useState("");
  const [edited, setEdited] = useState<string | null>(null);
  const [contactsAvailable, setContactsAvailable] = useState(false);

  useEffect(() => {
    setContactsAvailable(canPickContact());
  }, []);

  const siteRow = sites.find((item) => item.id === site);
  const generated = useMemo(
    () =>
      purchaseOrderText({
        business: businessName,
        supplier: party?.name ?? supplierName,
        lines,
        showRates,
        reference,
        deliverTo: siteRow ? [siteRow.name, siteRow.location].filter(Boolean).join(", ") : "",
        neededBy,
      }),
    [businessName, party?.name, supplierName, lines, showRates, reference, siteRow, neededBy],
  );
  const message = edited ?? generated;

  function onSend() {
    if (party && !party.phone.trim() && hasPhone(phone)) {
      updateParty(party.id, { name: party.name, phone, role: party.role, note: party.note });
      toast.success(`Saved the number to ${party.name}`);
    }
  }

  async function fromContacts() {
    try {
      const picked = await pickContact();
      if (picked?.phone) setPhone(picked.phone);
    } catch {
      toast.error("Couldn't open your contacts.");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Field label={`Supplier phone${party ? ` — ${party.name}` : ""}`}>
        <div className="flex gap-2">
          <TextInput inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="98xxx xxxxx" />
          {contactsAvailable ? (
            <button
              type="button"
              onClick={fromContacts}
              className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-line bg-surface text-brass"
              aria-label="Pick from contacts"
            >
              <Contact className="size-5" />
            </button>
          ) : null}
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Deliver to">
          <SelectInput value={site} onChange={(event) => setSite(event.target.value)}>
            <option value="">Don't say</option>
            {sites.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Needed by">
          <TextInput type="date" value={neededBy} min={todayISO()} onChange={(event) => setNeededBy(event.target.value)} />
        </Field>
      </div>
      <label className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-3 text-sm font-medium">
        Show rates and total
        <input
          type="checkbox"
          checked={showRates}
          onChange={(event) => setShowRates(event.target.checked)}
          className="size-5 accent-[var(--color-brass)]"
        />
      </label>
      <Field label="Message">
        <TextArea value={message} onChange={(event) => setEdited(event.target.value)} className="min-h-56 font-mono text-sm" />
      </Field>
      {edited !== null ? (
        <button type="button" onClick={() => setEdited(null)} className="-mt-2 inline-flex items-center gap-1 self-start text-xs font-semibold text-brass">
          <RotateCcw className="size-3.5" aria-hidden="true" />
          Reset message
        </button>
      ) : null}
      {!hasPhone(phone) ? (
        <p className="-mt-1 text-xs text-muted">No number? WhatsApp and SMS will ask whom to send it to.</p>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <a
          href={whatsAppLink(phone, message)}
          target="_blank"
          rel="noreferrer"
          onClick={onSend}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-get px-4 text-sm font-semibold text-bg"
        >
          <MessageCircle className="size-4" aria-hidden="true" />
          WhatsApp
        </a>
        <a
          href={smsLink(phone, message)}
          onClick={onSend}
          className={cn("inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-ink px-4 text-sm font-semibold text-bg")}
        >
          <MessageSquareText className="size-4" aria-hidden="true" />
          SMS
        </a>
      </div>
    </div>
  );
}

/** The purchase order as its own drawer (from a saved purchase bill). */
export function PurchaseOrderDrawer({
  open,
  onOpenChange,
  ...order
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
} & Parameters<typeof PurchaseOrderForm>[0]) {
  return (
    <DrawerFrame open={open} onOpenChange={onOpenChange} title="Send purchase order" lede="Sends the item list to the supplier's phone.">
      {open ? <PurchaseOrderForm {...order} /> : null}
      <Button variant="ghost" className="mt-2 w-full" onClick={() => onOpenChange(false)}>
        Done
      </Button>
    </DrawerFrame>
  );
}
