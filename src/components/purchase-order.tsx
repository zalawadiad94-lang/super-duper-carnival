import { useEffect, useState } from "react";
import { Contact } from "lucide-react";
import { toast } from "sonner";
import { DrawerFrame } from "@/components/drawers";
import { ImageSendPanel } from "@/components/image-send";
import { Button, Field, SelectInput, TextInput } from "@/components/ui";
import { canPickContact, pickContact } from "@/lib/contacts";
import { todayISO } from "@/lib/format";
import { renderPurchaseOrder, type OrderLine } from "@/lib/po-image";
import { hasPhone } from "@/lib/share";
import { useLedger } from "@/lib/store";

/** Build the purchase order JPG and send it to the supplier's WhatsApp. */
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
  const [poNote, setPoNote] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [contactsAvailable, setContactsAvailable] = useState(false);

  useEffect(() => {
    setContactsAvailable(canPickContact());
  }, []);

  const siteRow = sites.find((item) => item.id === site);
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

      <ImageSendPanel image={image} fileName={fileName} phone={phone} onBeforeSend={onSend} />
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
