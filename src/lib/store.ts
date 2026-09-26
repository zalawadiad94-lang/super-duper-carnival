import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  parseBooks,
  sampleBooks,
  type Books,
  type Entry,
  type EntryKind,
  type Party,
  type PartyRole,
  type Site,
  type SiteStatus,
} from "@/lib/model";

export type PartyInput = {
  name: string;
  phone: string;
  role: PartyRole;
  note: string;
};

export type SiteInput = {
  name: string;
  location: string;
  status: SiteStatus;
  clientPartyId: string | null;
};

export type EntryInput = {
  partyId: string;
  siteId: string | null;
  kind: EntryKind;
  amount: number;
  date: string;
  note: string;
};

type LedgerState = Books & {
  hydrated: boolean;
  setBusinessName: (name: string) => void;
  dismissSample: () => void;
  addParty: (input: PartyInput) => string;
  updateParty: (id: string, input: PartyInput) => void;
  deleteParty: (id: string) => void;
  addSite: (input: SiteInput) => string;
  updateSite: (id: string, input: SiteInput) => void;
  deleteSite: (id: string) => void;
  addEntry: (input: EntryInput) => string;
  updateEntry: (id: string, input: EntryInput) => void;
  deleteEntry: (id: string) => void;
  loadSample: () => void;
  clearAll: () => void;
  replaceBooks: (value: unknown) => boolean;
};

function uid() {
  return crypto.randomUUID();
}

const sample = sampleBooks();

export const useLedger = create<LedgerState>()(
  persist(
    (set) => ({
      ...sample,
      hydrated: false,
      setBusinessName: (name) => set({ businessName: name.trim() || "My Construction Co." }),
      dismissSample: () => set({ showSampleHint: false }),
      addParty: (input) => {
        const id = uid();
        const party: Party = {
          id,
          name: input.name.trim(),
          phone: input.phone.trim(),
          role: input.role,
          note: input.note.trim(),
          createdAt: new Date().toISOString(),
        };
        set((state) => ({ parties: [party, ...state.parties] }));
        return id;
      },
      updateParty: (id, input) =>
        set((state) => ({
          parties: state.parties.map((party) =>
            party.id === id
              ? {
                  ...party,
                  name: input.name.trim(),
                  phone: input.phone.trim(),
                  role: input.role,
                  note: input.note.trim(),
                }
              : party,
          ),
        })),
      deleteParty: (id) =>
        set((state) => ({
          parties: state.parties.filter((party) => party.id !== id),
          entries: state.entries.filter((entry) => entry.partyId !== id),
          sites: state.sites.map((site) =>
            site.clientPartyId === id ? { ...site, clientPartyId: null } : site,
          ),
        })),
      addSite: (input) => {
        const id = uid();
        const site: Site = {
          id,
          name: input.name.trim(),
          location: input.location.trim(),
          status: input.status,
          clientPartyId: input.clientPartyId,
          createdAt: new Date().toISOString(),
        };
        set((state) => ({ sites: [site, ...state.sites] }));
        return id;
      },
      updateSite: (id, input) =>
        set((state) => ({
          sites: state.sites.map((site) =>
            site.id === id
              ? {
                  ...site,
                  name: input.name.trim(),
                  location: input.location.trim(),
                  status: input.status,
                  clientPartyId: input.clientPartyId,
                }
              : site,
          ),
        })),
      deleteSite: (id) =>
        set((state) => ({
          sites: state.sites.filter((site) => site.id !== id),
          entries: state.entries.map((entry) =>
            entry.siteId === id ? { ...entry, siteId: null } : entry,
          ),
        })),
      addEntry: (input) => {
        const id = uid();
        const entry: Entry = {
          id,
          ...input,
          note: input.note.trim(),
          createdAt: new Date().toISOString(),
        };
        set((state) => ({ entries: [entry, ...state.entries] }));
        return id;
      },
      updateEntry: (id, input) =>
        set((state) => ({
          entries: state.entries.map((entry) =>
            entry.id === id ? { ...entry, ...input, note: input.note.trim() } : entry,
          ),
        })),
      deleteEntry: (id) =>
        set((state) => ({ entries: state.entries.filter((entry) => entry.id !== id) })),
      loadSample: () => set({ ...sampleBooks(), hydrated: true }),
      clearAll: () =>
        set({
          businessName: "My Construction Co.",
          parties: [],
          sites: [],
          entries: [],
          showSampleHint: false,
        }),
      replaceBooks: (value) => {
        const books = parseBooks(value);
        if (!books) return false;
        set(books);
        return true;
      },
    }),
    {
      name: "sitekhata-books-v1",
      skipHydration: true,
      partialize: (state) => ({
        businessName: state.businessName,
        parties: state.parties,
        sites: state.sites,
        entries: state.entries,
        showSampleHint: state.showSampleHint,
      }),
    },
  ),
);

type AddState = {
  open: boolean;
  partyId: string | null;
  siteId: string | null;
  entryId: string | null;
};

type FormState = { open: boolean; id: string | null };

type UiState = {
  add: AddState;
  partyForm: FormState;
  siteForm: FormState;
  booksOpen: boolean;
  openAdd: (partial?: Partial<Omit<AddState, "open">>) => void;
  closeAdd: () => void;
  openPartyForm: (id?: string | null) => void;
  closePartyForm: () => void;
  openSiteForm: (id?: string | null) => void;
  closeSiteForm: () => void;
  setBooksOpen: (open: boolean) => void;
};

const closed = { partyForm: { open: false, id: null }, siteForm: { open: false, id: null }, booksOpen: false };

export const useUi = create<UiState>((set) => ({
  add: { open: false, partyId: null, siteId: null, entryId: null },
  partyForm: { open: false, id: null },
  siteForm: { open: false, id: null },
  booksOpen: false,
  openAdd: (partial) =>
    set({
      ...closed,
      add: {
        open: true,
        partyId: partial?.partyId ?? null,
        siteId: partial?.siteId ?? null,
        entryId: partial?.entryId ?? null,
      },
    }),
  closeAdd: () => set({ add: { open: false, partyId: null, siteId: null, entryId: null } }),
  openPartyForm: (id = null) =>
    set({
      ...closed,
      add: { open: false, partyId: null, siteId: null, entryId: null },
      partyForm: { open: true, id },
    }),
  closePartyForm: () => set({ partyForm: { open: false, id: null } }),
  openSiteForm: (id = null) =>
    set({
      ...closed,
      add: { open: false, partyId: null, siteId: null, entryId: null },
      siteForm: { open: true, id },
    }),
  closeSiteForm: () => set({ siteForm: { open: false, id: null } }),
  setBooksOpen: (open) =>
    set(
      open
        ? {
            ...closed,
            add: { open: false, partyId: null, siteId: null, entryId: null },
            booksOpen: true,
          }
        : { booksOpen: false },
    ),
}));
