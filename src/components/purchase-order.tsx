import { useEffect, useMemo, useState } from "react";
import { Contact, Download, ImageIcon, MessageCircle, MessageSquareText, RotateCcw, Share2 } from "lucide-react";
import { toast } from "sonner";
import { DrawerFrame } from "@/components/drawers";
import { Button, Field, SelectInput, TextArea, TextInput } from "@/components/ui";
import { formatQty, lineTotal, round2 } from "@/lib/bills";
import { canPickContact, pickContact } from "@/lib/contacts";
import { cn } from "@/lib/cn";
import { formatDay, formatINR, todayISO } from "@/lib/format";
import { renderPurchaseOrder, type OrderLine } from "@/lib/po-image";
import { hasPhone, saveImage, shareImage, smsLink, whatsAppLink } from "@/lib/share";
import { useLedger } from "@/lib/store";

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
  const [poNote, setPoNote] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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
  const supplier = party?.name ?? supplierName;
  const deliverTo = siteRow ? [siteRow.name, siteRow.location].filter(Boolean).join(", ") : "";
  const fileName = `PO-${(reference || "order").replace(/[^A-Za-z0-9]+/g, "-")}-${todayISO()}.jpg`.replace(/-+/g, "-");

  // Redraw the JPG preview when the order changes (debounced while typing).
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      void renderPurchaseOrder({
        business: businessName,
        supplier,
        supplierPhone: hasPhone(phone) ? phone.trim() : "",
        reference,
        lines,
        showRates,
        deliverTo,
        neededBy,
        note: poNote,
      }).then((url) => {
        if (!cancelled) setImage(url);
      });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [businessName, supplier, phone, reference, lines, showRates, deliverTo, neededBy, poNote]);

  async function sendImage(whatsapp: boolean) {
    if (!image || busy) return;
    setBusy(true);
    onSend();
    try {
      const how = await shareImage(image, fileName, `Purchase order ${reference} from ${businessName}`, phone, whatsapp);
      if (how === "downloaded") toast.success("Purchase order saved as JPG — attach it in WhatsApp");
    } finally {
      setBusy(false);
    }
  }

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
      <Field label="Note on the order (optional)">
        <TextInput value={poNote} onChange={(event) => setPoNote(event.target.value)} placeholder="Unload at gate 2, call before coming" />
      </Field>

      <div className="overflow-hidden rounded-2xl border border-line bg-bg p-2">
        {image ? (
          <img src={image} alt="Purchase order preview" className="w-full rounded-xl shadow-sm" />
        ) : (
          <div className="flex h-40 items-center justify-center gap-2 text-sm text-muted">
            <ImageIcon className="size-4" aria-hidden="true" />
            Making the purchase order…
          </div>
        )}
      </div>

      <Button className="h-14 w-full bg-get text-base" disabled={!image || busy} onClick={() => void sendImage(true)}>
        <MessageCircle className="size-5" aria-hidden="true" />
        Send JPG on WhatsApp
      </Button>
      <div className="-mt-2 grid grid-cols-2 gap-2">
        <Button variant="soft" disabled={!image || busy} onClick={() => void sendImage(false)}>
          <Share2 className="size-4" aria-hidden="true" />
          Share image
        </Button>
        <Button variant="soft" disabled={!image} onClick={() => image && saveImage(image, fileName)}>
          <Download className="size-4" aria-hidden="true" />
          Save JPG
        </Button>
      </div>
      {!hasPhone(phone) ? (
        <p className="-mt-2 text-xs text-muted">No number? WhatsApp will ask which chat to send it to.</p>
      ) : null}

      <details className="rounded-xl border border-line px-3 py-2">
        <summary className="cursor-pointer text-sm font-semibold text-muted">Send as text instead</summary>
        <div className="mt-3 flex flex-col gap-3">
          <TextArea value={message} onChange={(event) => setEdited(event.target.value)} className="min-h-48 font-mono text-sm" aria-label="Message" />
          {edited !== null ? (
            <button type="button" onClick={() => setEdited(null)} className="inline-flex items-center gap-1 self-start text-xs font-semibold text-brass">
              <RotateCcw className="size-3.5" aria-hidden="true" />
              Reset message
            </button>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <a
              href={whatsAppLink(phone, message)}
              target="_blank"
              rel="noreferrer"
              onClick={onSend}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-get px-4 text-sm font-semibold text-get"
            >
              <MessageCircle className="size-4" aria-hidden="true" />
              WhatsApp text
            </a>
            <a
              href={smsLink(phone, message)}
              onClick={onSend}
              className={cn("inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-ink px-4 text-sm font-semibold text-ink")}
            >
              <MessageSquareText className="size-4" aria-hidden="true" />
              SMS
            </a>
          </div>
        </div>
      </details>
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
    <DrawerFrame open={open} onOpenChange={onOpenChange} title="Send purchase order" lede="A JPG of the order, sent to the supplier's WhatsApp.">
      {open ? <PurchaseOrderForm {...order} /> : null}
      <Button variant="ghost" className="mt-2 w-full" onClick={() => onOpenChange(false)}>
        Done
      </Button>
    </DrawerFrame>
  );
}
