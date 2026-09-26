import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  billLabel,
  khataKinds,
  moveSupplierExpenses,
  khataNote,
  type Bill,
  type BillLine,
  type BillPayment,
  type BillType,
  type Item,
} from "@/lib/bills";
import type { StockAdjustment } from "@/lib/stock";
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

export type BillInput = {
  type: BillType;
  number: number;
  partyId: string | null;
  partyName: string;
  siteId: string | null;
  date: string;
  amount: number;
  note: string;
  lines: BillLine[];
};

export type ItemInput = Omit<Item, "id" | "createdAt">;
export type AdjustmentInput = Omit<StockAdjustment, "id" | "createdAt">;

export type PaymentInput = { amount: number; date: string };

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
  addBill: (input: BillInput, paidNow: number) => string;
  updateBill: (id: string, input: BillInput) => void;
  deleteBill: (id: string) => void;
  addBillPayment: (billId: string, input: PaymentInput) => string;
  deleteBillPayment: (billId: string, paymentId: string) => void;
  addItem: (input: ItemInput) => string;
  updateItem: (id: string, input: ItemInput) => void;
  deleteItem: (id: string) => void;
  addAdjustment: (input: AdjustmentInput) => void;
  deleteAdjustment: (id: string) => void;
  loadSample: () => void;
  clearAll: () => void;
  replaceBooks: (value: unknown) => boolean;
};

function uid() {
  return crypto.randomUUID();
}

const sample = sampleBooks();

/**
 * Bills with a party are mirrored into that party's khata: one entry for the
 * bill and one per payment. These helpers build and rewrite those entries.
 */
function billEntry(bill: Bill, role: Party["role"], id: string, createdAt: string): Entry {
  return {
    id,
    partyId: bill.partyId!,
    siteId: bill.siteId,
    kind: khataKinds(bill.type, role).bill,
    amount: bill.amount,
    date: bill.date,
    note: khataNote(bill),
    createdAt,
  };
}

function paymentEntry(bill: Bill, role: Party["role"], payment: BillPayment, id: string, createdAt: string): Entry {
  return {
    id,
    partyId: bill.partyId!,
    siteId: bill.siteId,
    kind: khataKinds(bill.type, role).payment,
    amount: payment.amount,
    date: payment.date,
    note: `Payment for ${billLabel(bill)}`,
    createdAt,
  };
}

/**
 * Rewrite a bill's khata entries after the bill changed. Missing entries are
 * created only where `create` says so (a new bill, a new payment, a newly
 * chosen party); a line someone deleted from the khata stays deleted.
 */
function syncBill(
  bill: Bill,
  parties: Party[],
  entries: Entry[],
  create: { bill: boolean; payments: "all" | Set<string> },
): { bill: Bill; entries: Entry[] } {
  const party = bill.partyId ? parties.find((item) => item.id === bill.partyId) : undefined;
  const linked = new Set([bill.entryId, ...bill.payments.map((payment) => payment.entryId)].filter(Boolean));
  const kept = entries.filter((entry) => !linked.has(entry.id));
  const createdAtOf = (id: string | null) => entries.find((entry) => entry.id === id)?.createdAt ?? new Date().toISOString();
  if (!party) {
    return {
      bill: { ...bill, partyId: null, entryId: null, payments: bill.payments.map((payment) => ({ ...payment, entryId: null })) },
      entries: kept,
    };
  }
  const makePayment = (payment: BillPayment) =>
    create.payments === "all" || create.payments.has(payment.id);
  const entryId = bill.entryId ?? (create.bill ? uid() : null);
  const payments = bill.payments.map((payment) => ({
    ...payment,
    entryId: payment.entryId ?? (makePayment(payment) ? uid() : null),
  }));
  const next: Bill = { ...bill, partyName: party.name, entryId, payments };
  const mirrored: Entry[] = [];
  if (entryId) mirrored.push(billEntry(next, party.role, entryId, createdAtOf(bill.entryId)));
  payments.forEach((payment, index) => {
    if (payment.entryId) {
      mirrored.push(paymentEntry(next, party.role, payment, payment.entryId, createdAtOf(bill.payments[index].entryId)));
    }
  });
  return { bill: next, entries: [...mirrored, ...kept] };
}

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
          // Keep their bills under the old name; the khata entries go with the party.
          bills: state.bills.map((bill) =>
            bill.partyId === id
              ? { ...bill, partyId: null, entryId: null, payments: bill.payments.map((pay) => ({ ...pay, entryId: null })) }
              : bill,
          ),
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
          bills: state.bills.map((bill) => (bill.siteId === id ? { ...bill, siteId: null } : bill)),
          stockAdjustments: state.stockAdjustments.map((adjustment) =>
            adjustment.siteId === id ? { ...adjustment, siteId: null } : adjustment,
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
        set((state) => ({
          entries: state.entries.filter((entry) => entry.id !== id),
          // A bill's khata line deleted from the khata: the bill stays, unlinked.
          bills: state.bills.map((bill) =>
            bill.entryId === id || bill.payments.some((pay) => pay.entryId === id)
              ? {
                  ...bill,
                  entryId: bill.entryId === id ? null : bill.entryId,
                  payments: bill.payments.map((pay) => (pay.entryId === id ? { ...pay, entryId: null } : pay)),
                }
              : bill,
          ),
        })),
      addBill: (input, paidNow) => {
        const id = uid();
        const now = new Date().toISOString();
        const draft: Bill = {
          id,
          ...input,
          partyName: input.partyName.trim(),
          note: input.note.trim(),
          entryId: null,
          payments: paidNow > 0 ? [{ id: uid(), amount: paidNow, date: input.date, entryId: null }] : [],
          createdAt: now,
        };
        set((state) => {
          const synced = syncBill(draft, state.parties, state.entries, { bill: true, payments: "all" });
          return { bills: [synced.bill, ...state.bills], entries: synced.entries };
        });
        return id;
      },
      updateBill: (id, input) =>
        set((state) => {
          const bill = state.bills.find((item) => item.id === id);
          if (!bill) return {};
          const newParty = input.partyId !== bill.partyId;
          const synced = syncBill(
            { ...bill, ...input, partyName: input.partyName.trim(), note: input.note.trim() },
            state.parties,
            state.entries,
            { bill: newParty, payments: newParty ? "all" : new Set() },
          );
          return {
            bills: state.bills.map((item) => (item.id === id ? synced.bill : item)),
            entries: synced.entries,
          };
        }),
      deleteBill: (id) =>
        set((state) => {
          const bill = state.bills.find((item) => item.id === id);
          if (!bill) return {};
          const linked = new Set([bill.entryId, ...bill.payments.map((pay) => pay.entryId)].filter(Boolean));
          return {
            bills: state.bills.filter((item) => item.id !== id),
            entries: state.entries.filter((entry) => !linked.has(entry.id)),
          };
        }),
      addBillPayment: (billId, input) => {
        const paymentId = uid();
        set((state) => {
          const bill = state.bills.find((item) => item.id === billId);
          if (!bill) return {};
          const payment: BillPayment = { id: paymentId, amount: input.amount, date: input.date, entryId: null };
          const synced = syncBill({ ...bill, payments: [...bill.payments, payment] }, state.parties, state.entries, {
            bill: false,
            payments: new Set([payment.id]),
          });
          return {
            bills: state.bills.map((item) => (item.id === billId ? synced.bill : item)),
            entries: synced.entries,
          };
        });
        return paymentId;
      },
      deleteBillPayment: (billId, paymentId) =>
        set((state) => {
          const bill = state.bills.find((item) => item.id === billId);
          const payment = bill?.payments.find((item) => item.id === paymentId);
          if (!bill || !payment) return {};
          return {
            bills: state.bills.map((item) =>
              item.id === billId ? { ...item, payments: item.payments.filter((pay) => pay.id !== paymentId) } : item,
            ),
            entries: state.entries.filter((entry) => entry.id !== payment.entryId),
          };
        }),
      addItem: (input) => {
        const id = uid();
        const item: Item = { id, ...input, name: input.name.trim(), unit: input.unit.trim(), createdAt: new Date().toISOString() };
        set((state) => ({ items: [item, ...state.items] }));
        return id;
      },
      updateItem: (id, input) =>
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id ? { ...item, ...input, name: input.name.trim(), unit: input.unit.trim() } : item,
          ),
        })),
      deleteItem: (id) =>
        set((state) => ({
          items: state.items.filter((item) => item.id !== id),
          stockAdjustments: state.stockAdjustments.filter((adjustment) => adjustment.itemId !== id),
          // Bills keep the row (name, qty, rate); it just stops counting as stock.
          bills: state.bills.map((bill) =>
            bill.lines.some((line) => line.itemId === id)
              ? { ...bill, lines: bill.lines.map((line) => (line.itemId === id ? { ...line, itemId: null } : line)) }
              : bill,
          ),
        })),
      addAdjustment: (input) =>
        set((state) => ({
          stockAdjustments: [
            { id: uid(), ...input, note: input.note.trim(), createdAt: new Date().toISOString() },
            ...state.stockAdjustments,
          ],
        })),
      deleteAdjustment: (id) =>
        set((state) => ({ stockAdjustments: state.stockAdjustments.filter((adjustment) => adjustment.id !== id) })),
      loadSample: () => set({ ...sampleBooks(), hydrated: true }),
      clearAll: () =>
        set({
          businessName: "My Construction Co.",
          parties: [],
          sites: [],
          entries: [],
          bills: [],
          items: [],
          stockAdjustments: [],
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
      // v1 added bills, v2 items and bill rows, v3 stock adjustments and
      // low-stock levels. Books saved before start with none (not the sample's).
      // v4 moves expense bills made out to suppliers into purchases.
      version: 4,
      migrate: (persisted) => {
        const state = {
          bills: [],
          items: [],
          stockAdjustments: [],
          ...(persisted as Partial<LedgerState>),
        } as LedgerState;
        const roles = new Map((state.parties ?? []).map((party) => [party.id, party.role]));
        return {
          ...state,
          bills: moveSupplierExpenses(
            state.bills.map((bill) => ({ ...bill, lines: bill.lines ?? [] })),
            (id) => roles.get(id),
          ),
          items: state.items.map((item) => ({ ...item, minStock: item.minStock ?? null })),
        };
      },
      skipHydration: true,
      partialize: (state) => ({
        businessName: state.businessName,
        parties: state.parties,
        sites: state.sites,
        entries: state.entries,
        bills: state.bills,
        items: state.items,
        stockAdjustments: state.stockAdjustments,
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
type BillFormState = FormState & { type: BillType };
type PaymentFormState = { open: boolean; billId: string | null };
export type StockMode = "out" | "in" | "count";
type StockFormState = { open: boolean; itemId: string | null; mode: StockMode };

type UiState = {
  add: AddState;
  partyForm: FormState;
  siteForm: FormState;
  booksOpen: boolean;
  billForm: BillFormState;
  paymentForm: PaymentFormState;
  itemForm: FormState;
  stockForm: StockFormState;
  openStockForm: (itemId: string | null, mode: StockMode) => void;
  closeStockForm: () => void;
  openItemForm: (id?: string | null) => void;
  closeItemForm: () => void;
  openBillForm: (type: BillType, id?: string | null) => void;
  closeBillForm: () => void;
  openPaymentForm: (billId: string) => void;
  closePaymentForm: () => void;
  openAdd: (partial?: Partial<Omit<AddState, "open">>) => void;
  closeAdd: () => void;
  openPartyForm: (id?: string | null) => void;
  closePartyForm: () => void;
  openSiteForm: (id?: string | null) => void;
  closeSiteForm: () => void;
  setBooksOpen: (open: boolean) => void;
};

const closed = {
  partyForm: { open: false, id: null },
  siteForm: { open: false, id: null },
  booksOpen: false,
  billForm: { open: false, id: null, type: "sale" as BillType },
  paymentForm: { open: false, billId: null },
  itemForm: { open: false, id: null },
  stockForm: { open: false, itemId: null, mode: "out" as StockMode },
};

export const useUi = create<UiState>((set) => ({
  add: { open: false, partyId: null, siteId: null, entryId: null },
  partyForm: { open: false, id: null },
  siteForm: { open: false, id: null },
  booksOpen: false,
  billForm: closed.billForm,
  paymentForm: closed.paymentForm,
  itemForm: closed.itemForm,
  stockForm: closed.stockForm,
  openStockForm: (itemId, mode) =>
    set({
      ...closed,
      add: { open: false, partyId: null, siteId: null, entryId: null },
      stockForm: { open: true, itemId, mode },
    }),
  closeStockForm: () => set((state) => ({ stockForm: { ...state.stockForm, open: false } })),
  openItemForm: (id = null) =>
    set({
      ...closed,
      add: { open: false, partyId: null, siteId: null, entryId: null },
      itemForm: { open: true, id },
    }),
  closeItemForm: () => set({ itemForm: { open: false, id: null } }),
  openBillForm: (type, id = null) =>
    set({
      ...closed,
      add: { open: false, partyId: null, siteId: null, entryId: null },
      billForm: { open: true, id, type },
    }),
  closeBillForm: () => set((state) => ({ billForm: { ...state.billForm, open: false, id: null } })),
  openPaymentForm: (billId) =>
    set({
      ...closed,
      add: { open: false, partyId: null, siteId: null, entryId: null },
      paymentForm: { open: true, billId },
    }),
  closePaymentForm: () => set({ paymentForm: { open: false, billId: null } }),
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
