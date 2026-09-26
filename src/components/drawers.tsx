import { useEffect, useMemo, useRef, useState } from "react";
import { Drawer } from "vaul";
import { toast } from "sonner";
import { Contact, Download, Upload } from "lucide-react";
import { Button, ConfirmDialog, Field, SelectInput, TextArea, TextInput } from "@/components/ui";
import { canPickContact, pickContact } from "@/lib/contacts";
import { todayISO, parseAmount } from "@/lib/format";
import {
  KIND_META,
  ROLE_META,
  SITE_STATUSES,
  kindsForRole,
  type EntryKind,
  type PartyRole,
  type SiteStatus,
} from "@/lib/model";
import { useLedger, useUi } from "@/lib/store";

function useWideScreen() {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const apply = () => setWide(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);
  return wide;
}

export function DrawerFrame({
  open,
  onOpenChange,
  title,
  lede,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  lede?: string;
  children: React.ReactNode;
}) {
  const wide = useWideScreen();

  useEffect(() => {
    if (!open || !wide) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, wide, onOpenChange]);

  if (wide) {
    if (!open) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-8">
        <button type="button" className="absolute inset-0 bg-ink/40" aria-label="Close" onClick={() => onOpenChange(false)} />
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="desk-dialog-title"
          className="relative z-10 max-h-full w-full max-w-2xl overflow-y-auto rounded-2xl border border-line bg-surface p-6"
        >
          <h2 id="desk-dialog-title" className="font-display text-2xl text-ink">
            {title}
          </h2>
          {lede ? <p className="mt-1 text-sm text-muted">{lede}</p> : null}
          <div className="mt-4">{children}</div>
        </div>
      </div>
    );
  }

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-ink/40" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 flex max-h-dvh flex-col rounded-t-2xl border-t border-line bg-surface outline-none">
          <Drawer.Handle className="mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full bg-line" />
          <div className="overflow-y-auto px-4 pb-8 pt-4">
            <Drawer.Title className="font-display text-2xl text-ink">{title}</Drawer.Title>
            {lede ? (
              <Drawer.Description className="mt-1 text-sm text-muted">{lede}</Drawer.Description>
            ) : (
              <Drawer.Description className="sr-only">{title}</Drawer.Description>
            )}
            <div className="mt-4">{children}</div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

export function EntryDrawer() {
  const add = useUi((state) => state.add);
  const closeAdd = useUi((state) => state.closeAdd);
  const parties = useLedger((state) => state.parties);
  const sites = useLedger((state) => state.sites);
  const entries = useLedger((state) => state.entries);
  const addEntry = useLedger((state) => state.addEntry);
  const updateEntry = useLedger((state) => state.updateEntry);
  const deleteEntry = useLedger((state) => state.deleteEntry);

  const [partyId, setPartyId] = useState<string | null>(null);
  const [kind, setKind] = useState<EntryKind>("bill");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [siteId, setSiteId] = useState("");
  const [note, setNote] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!add.open) return;
    const existing = add.entryId ? entries.find((entry) => entry.id === add.entryId) : undefined;
    const nextParty = existing?.partyId ?? add.partyId;
    const party = parties.find((item) => item.id === nextParty);
    const options = party ? kindsForRole(party.role) : (["gave"] as EntryKind[]);
    setPartyId(nextParty);
    setKind(existing && options.includes(existing.kind) ? existing.kind : options[0]);
    setAmount(existing ? String(existing.amount) : "");
    setDate(existing?.date ?? todayISO());
    setSiteId(existing?.siteId ?? add.siteId ?? "");
    setNote(existing?.note ?? "");
    setQuery("");
    setError(null);
  }, [add.open, add.entryId, add.partyId, add.siteId, entries, parties]);

  const party = parties.find((item) => item.id === partyId) ?? null;
  const kindOptions = party ? kindsForRole(party.role) : [];
  const filteredParties = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = [...parties].sort((a, b) => a.name.localeCompare(b.name));
    if (!q) return list;
    return list.filter((item) => item.name.toLowerCase().includes(q) || item.phone.includes(q));
  }, [parties, query]);

  function chooseParty(id: string) {
    const next = parties.find((item) => item.id === id);
    setPartyId(id);
    if (next) {
      const options = kindsForRole(next.role);
      if (!options.includes(kind)) setKind(options[0]);
    }
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!partyId) {
      setError("Choose who this entry is with.");
      return;
    }
    const parsed = parseAmount(amount);
    if (parsed === null) {
      setError("Enter an amount greater than zero.");
      return;
    }
    if (!date) {
      setError("Pick a date.");
      return;
    }
    const input = {
      partyId,
      siteId: siteId || null,
      kind,
      amount: parsed,
      date,
      note,
    };
    const name = parties.find((item) => item.id === partyId)?.name ?? "khata";
    if (add.entryId) {
      updateEntry(add.entryId, input);
      toast.success(`Updated ${name}`);
    } else {
      addEntry(input);
      toast.success(`Saved to ${name}`);
    }
    closeAdd();
  }

  return (
    <>
      <DrawerFrame
        open={add.open}
        onOpenChange={(open) => {
          if (!open) closeAdd();
        }}
        title={add.entryId ? "Edit entry" : "Add entry"}
        lede="Same rule as a paper khata: you gave minus you got."
      >
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          {!party ? (
            <div>
              <Field label="Party">
                <TextInput
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search client, supplier, labour"
                  autoFocus
                />
              </Field>
              <div className="mt-2 max-h-52 overflow-y-auto rounded-xl border border-line">
                {filteredParties.length === 0 ? (
                  <p className="px-3 py-4 text-sm text-muted">No matching party. Add one from Parties first.</p>
                ) : (
                  filteredParties.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => chooseParty(item.id)}
                      className="flex w-full items-center justify-between gap-3 border-b border-line px-3 py-3 text-left last:border-b-0"
                    >
                      <span>
                        <span className="block font-medium">{item.name}</span>
                        <span className="text-xs text-muted">{ROLE_META[item.role].label}</span>
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3 rounded-xl bg-brass-soft px-3 py-3">
              <div>
                <p className="text-xs font-semibold text-brass">{ROLE_META[party.role].label}</p>
                <p className="font-medium text-ink">{party.name}</p>
              </div>
              <Button variant="ghost" className="h-10 px-2 text-brass" onClick={() => setPartyId(null)}>
                Change
              </Button>
            </div>
          )}

          {party ? (
            <div className="grid grid-cols-2 gap-2">
              {kindOptions.map((option) => {
                const meta = KIND_META[option];
                const selected = kind === option;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setKind(option)}
                    className={`rounded-xl border px-3 py-3 text-left ${selected ? "border-brass bg-brass-soft" : "border-line bg-surface"}`}
                  >
                    <span className="block text-sm font-semibold text-ink">{meta.label}</span>
                    <span className="mt-0.5 block text-xs text-muted">{meta.hint}</span>
                  </button>
                );
              })}
            </div>
          ) : null}

          <Field label="Amount (₹)">
            <TextInput
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0"
              className="font-display text-2xl"
              autoFocus={Boolean(party)}
            />
          </Field>
          <Field label="Date">
            <TextInput type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </Field>
          <Field label="Site">
            <SelectInput value={siteId} onChange={(event) => setSiteId(event.target.value)}>
              <option value="">No site</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Note">
            <TextArea
              value={note}
              maxLength={240}
              onChange={(event) => setNote(event.target.value)}
              placeholder="RA bill, bags of cement, week of wages…"
            />
          </Field>
          {error ? <p className="text-sm text-give">{error}</p> : null}
          <Button type="submit" className="w-full">
            {add.entryId ? "Save changes" : "Save entry"}
          </Button>
          {add.entryId ? (
            <Button variant="danger" className="w-full" onClick={() => setConfirmDelete(true)}>
              Delete entry
            </Button>
          ) : null}
        </form>
      </DrawerFrame>
      <ConfirmDialog
        open={confirmDelete}
        title="Delete this entry?"
        body="The party's balance will update. This stays only on this device."
        confirmLabel="Delete"
        danger
        onOpenChange={setConfirmDelete}
        onConfirm={() => {
          if (add.entryId) {
            deleteEntry(add.entryId);
            toast.success("Entry deleted");
          }
          setConfirmDelete(false);
          closeAdd();
        }}
      />
    </>
  );
}

export function PartyDrawer() {
  const form = useUi((state) => state.partyForm);
  const close = useUi((state) => state.closePartyForm);
  const parties = useLedger((state) => state.parties);
  const entries = useLedger((state) => state.entries);
  const addParty = useLedger((state) => state.addParty);
  const updateParty = useLedger((state) => state.updateParty);
  const deleteParty = useLedger((state) => state.deleteParty);
  const existing = parties.find((party) => party.id === form.id);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<PartyRole>("client");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [contactsAvailable, setContactsAvailable] = useState(false);

  useEffect(() => {
    setContactsAvailable(canPickContact());
  }, []);

  useEffect(() => {
    if (!form.open) return;
    setName(existing?.name ?? "");
    setPhone(existing?.phone ?? "");
    setRole(existing?.role ?? "client");
    setNote(existing?.note ?? "");
    setError(null);
  }, [form.open, existing?.id, existing?.name, existing?.phone, existing?.role, existing?.note]);

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    const input = { name, phone, role, note };
    if (existing) {
      updateParty(existing.id, input);
      toast.success("Party updated");
    } else {
      addParty(input);
      toast.success(`${name.trim()} added`);
    }
    close();
  }

  async function fromContacts() {
    try {
      const picked = await pickContact();
      if (!picked) return;
      if (picked.name) setName(picked.name);
      if (picked.phone) setPhone(picked.phone);
      setError(null);
    } catch {
      toast.error("Couldn't open your contacts.");
    }
  }

  const entryCount = existing ? entries.filter((entry) => entry.partyId === existing.id).length : 0;

  return (
    <>
      <DrawerFrame
        open={form.open}
        onOpenChange={(open) => {
          if (!open) close();
        }}
        title={existing ? "Edit party" : "New party"}
        lede="A client, supplier, labour gang, or subcontractor."
      >
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(ROLE_META) as PartyRole[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setRole(option)}
                className={`rounded-xl border px-3 py-3 text-left ${role === option ? "border-brass bg-brass-soft" : "border-line"}`}
              >
                <span className="block text-sm font-semibold">{ROLE_META[option].label}</span>
                <span className="mt-0.5 block text-xs text-muted">{ROLE_META[option].hint}</span>
              </button>
            ))}
          </div>
          {!existing && contactsAvailable ? (
            <Button variant="soft" className="w-full" onClick={fromContacts}>
              <Contact className="size-4" aria-hidden="true" />
              Pick from contacts
            </Button>
          ) : null}
          <Field label="Name">
            <TextInput value={name} onChange={(event) => setName(event.target.value)} placeholder="Mehta Developers" autoFocus />
          </Field>
          <Field label="Phone">
            <TextInput inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="98xxx xxxxx" />
          </Field>
          <Field label="Note">
            <TextArea value={note} maxLength={240} onChange={(event) => setNote(event.target.value)} placeholder="Site engineer, weekly wages, material they supply" />
          </Field>
          {error ? <p className="text-sm text-give">{error}</p> : null}
          <Button type="submit" className="w-full">
            {existing ? "Save party" : "Add party"}
          </Button>
          {existing ? (
            <Button variant="danger" className="w-full" onClick={() => setConfirmDelete(true)}>
              Delete party
            </Button>
          ) : null}
        </form>
      </DrawerFrame>
      <ConfirmDialog
        open={confirmDelete}
        title="Delete this party?"
        body={
          entryCount
            ? `This also removes ${entryCount} entr${entryCount === 1 ? "y" : "ies"} from the khata.`
            : "They have no entries yet."
        }
        confirmLabel="Delete"
        danger
        onOpenChange={setConfirmDelete}
        onConfirm={() => {
          if (existing) {
            deleteParty(existing.id);
            toast.success("Party removed");
          }
          setConfirmDelete(false);
          close();
        }}
      />
    </>
  );
}

export function SiteDrawer() {
  const form = useUi((state) => state.siteForm);
  const close = useUi((state) => state.closeSiteForm);
  const sites = useLedger((state) => state.sites);
  const parties = useLedger((state) => state.parties);
  const addSite = useLedger((state) => state.addSite);
  const updateSite = useLedger((state) => state.updateSite);
  const deleteSite = useLedger((state) => state.deleteSite);
  const existing = sites.find((site) => site.id === form.id);
  const clients = parties.filter((party) => party.role === "client");
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [status, setStatus] = useState<SiteStatus>("active");
  const [clientPartyId, setClientPartyId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!form.open) return;
    setName(existing?.name ?? "");
    setLocation(existing?.location ?? "");
    setStatus(existing?.status ?? "active");
    setClientPartyId(existing?.clientPartyId ?? "");
    setError(null);
  }, [form.open, existing?.id, existing?.name, existing?.location, existing?.status, existing?.clientPartyId]);

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError("Site name is required.");
      return;
    }
    const input = {
      name,
      location,
      status,
      clientPartyId: clientPartyId || null,
    };
    if (existing) {
      updateSite(existing.id, input);
      toast.success("Site updated");
    } else {
      addSite(input);
      toast.success(`${name.trim()} added`);
    }
    close();
  }

  return (
    <>
      <DrawerFrame
        open={form.open}
        onOpenChange={(open) => {
          if (!open) close();
        }}
        title={existing ? "Edit site" : "New site"}
        lede="A job you are running — building, road, farmhouse."
      >
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <Field label="Site name">
            <TextInput value={name} onChange={(event) => setName(event.target.value)} placeholder="Greenfield Residency" autoFocus />
          </Field>
          <Field label="Location">
            <TextInput value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Sector, city, chainage" />
          </Field>
          <Field label="Status">
            <SelectInput value={status} onChange={(event) => setStatus(event.target.value as SiteStatus)}>
              {SITE_STATUSES.map((option) => (
                <option key={option} value={option}>
                  {option === "active" ? "Active" : "Completed"}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Client">
            <SelectInput value={clientPartyId} onChange={(event) => setClientPartyId(event.target.value)}>
              <option value="">No client linked</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </SelectInput>
          </Field>
          {error ? <p className="text-sm text-give">{error}</p> : null}
          <Button type="submit" className="w-full">
            {existing ? "Save site" : "Add site"}
          </Button>
          {existing ? (
            <Button variant="danger" className="w-full" onClick={() => setConfirmDelete(true)}>
              Delete site
            </Button>
          ) : null}
        </form>
      </DrawerFrame>
      <ConfirmDialog
        open={confirmDelete}
        title="Delete this site?"
        body="Entries stay on each party's khata. They just won't be tagged to this site."
        confirmLabel="Delete site"
        danger
        onOpenChange={setConfirmDelete}
        onConfirm={() => {
          if (existing) {
            deleteSite(existing.id);
            toast.success("Site removed");
          }
          setConfirmDelete(false);
          close();
        }}
      />
    </>
  );
}

export function BooksDrawer() {
  const open = useUi((state) => state.booksOpen);
  const setOpen = useUi((state) => state.setBooksOpen);
  const businessName = useLedger((state) => state.businessName);
  const setBusinessName = useLedger((state) => state.setBusinessName);
  const loadSample = useLedger((state) => state.loadSample);
  const clearAll = useLedger((state) => state.clearAll);
  const replaceBooks = useLedger((state) => state.replaceBooks);
  const parties = useLedger((state) => state.parties);
  const sites = useLedger((state) => state.sites);
  const entries = useLedger((state) => state.entries);
  const bills = useLedger((state) => state.bills);
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(businessName);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmSample, setConfirmSample] = useState(false);

  useEffect(() => {
    if (open) setName(businessName);
  }, [open, businessName]);

  function exportBooks() {
    const payload = { businessName, parties, sites, entries, bills };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "sitekhata-backup.json";
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Backup downloaded");
  }

  function onFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        if (!replaceBooks(data)) {
          toast.error("That file isn't a Sitekhata backup.");
          return;
        }
        toast.success("Books restored");
        setOpen(false);
      } catch {
        toast.error("Couldn't read that file.");
      }
    };
    reader.readAsText(file);
  }

  return (
    <>
      <DrawerFrame
        open={open}
        onOpenChange={setOpen}
        title="Your books"
        lede="Saved on this phone or computer only. Export a backup before you clear the browser."
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            setBusinessName(name);
            toast.success("Firm name saved");
            setOpen(false);
          }}
        >
          <Field label="Firm name">
            <TextInput value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Button type="submit" className="w-full">
            Save name
          </Button>
        </form>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button variant="soft" onClick={exportBooks}>
            <Download className="size-4" />
            Export
          </Button>
          <Button variant="soft" onClick={() => fileRef.current?.click()}>
            <Upload className="size-4" />
            Import
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) onFile(file);
            }}
          />
        </div>
        <div className="mt-4 flex flex-col gap-2">
          <Button variant="ghost" className="border border-line" onClick={() => setConfirmSample(true)}>
            Load sample contractor books
          </Button>
          <Button variant="danger" onClick={() => setConfirmClear(true)}>
            Start fresh
          </Button>
        </div>
      </DrawerFrame>
      <ConfirmDialog
        open={confirmSample}
        title="Replace with sample books?"
        body="This overwrites the khata on this device with Aarav Constructions — a sample building contractor."
        confirmLabel="Load sample"
        onOpenChange={setConfirmSample}
        onConfirm={() => {
          loadSample();
          toast.success("Sample books loaded");
          setConfirmSample(false);
          setOpen(false);
        }}
      />
      <ConfirmDialog
        open={confirmClear}
        title="Clear the whole khata?"
        body="Parties, sites, and entries on this device will be removed. Export a backup first if you need them."
        confirmLabel="Clear books"
        danger
        onOpenChange={setConfirmClear}
        onConfirm={() => {
          clearAll();
          toast.success("Books cleared");
          setConfirmClear(false);
          setOpen(false);
        }}
      />
    </>
  );
}
