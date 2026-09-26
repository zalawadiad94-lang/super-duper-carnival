import { daysAgo } from "@/lib/format";
import type { EntryKind, PartyRole } from "@/lib/model";

export const BILL_TYPES = ["sale", "purchase", "expense"] as const;
export type BillType = (typeof BILL_TYPES)[number];

export type BillPayment = {
  id: string;
  amount: number;
  date: string;
  /** The payment's entry in the party khata, when the bill has a party. */
  entryId: string | null;
};

/** A thing you buy or sell: cement, sand, steel, JCB hours. */
export type Item = {
  id: string;
  name: string;
  /** bag, ton, cft, trolley, nos… */
  unit: string;
  purchasePrice: number | null;
  salePrice: number | null;
  /** Stock on hand before any bill in the app. */
  openingStock: number;
  createdAt: string;
};

/** One row on a sale or purchase bill. */
export type BillLine = {
  id: string;
  /** The catalogue item, or null if it was deleted (name/unit are kept). */
  itemId: string | null;
  name: string;
  unit: string;
  qty: number;
  rate: number;
};

export type Bill = {
  id: string;
  type: BillType;
  number: number;
  partyId: string | null;
  /** Name shown when there is no party (walk-in customer, "Diesel", …). */
  partyName: string;
  siteId: string | null;
  date: string;
  amount: number;
  note: string;
  /** The bill's entry in the party khata, when the bill has a party. */
  entryId: string | null;
  /** Item rows (sale and purchase bills). With rows, amount is their total. */
  lines: BillLine[];
  payments: BillPayment[];
  createdAt: string;
};

/** Bill types that carry items and move stock (+1 in, -1 out). */
export const STOCK_EFFECT: Record<BillType, number> = { sale: -1, purchase: 1, expense: 0 };

export function round2(value: number) {
  return Math.round(value * 100) / 100;
}

export function lineTotal(line: Pick<BillLine, "qty" | "rate">) {
  return round2(line.qty * line.rate);
}

export function linesTotal(lines: Pick<BillLine, "qty" | "rate">[]) {
  return round2(lines.reduce((sum, line) => sum + lineTotal(line), 0));
}

export function formatQty(qty: number, unit = "") {
  const n = Number.isInteger(qty) ? String(qty) : String(round2(qty));
  return unit ? `${n} ${unit}` : n;
}

/** "Cement 200 bag, Sand 3 trolley" */
export function linesSummary(lines: BillLine[]) {
  return lines.map((line) => `${line.name} ${formatQty(line.qty, line.unit)}`).join(", ");
}

export type StockMove = { bill: Bill; line: BillLine; change: number };

/** Bill rows that moved this item's stock, newest first. */
export function itemMoves(itemId: string, bills: Bill[]): StockMove[] {
  const moves: StockMove[] = [];
  for (const bill of bills) {
    const effect = STOCK_EFFECT[bill.type];
    if (!effect) continue;
    for (const line of bill.lines) {
      if (line.itemId === itemId) moves.push({ bill, line, change: effect * line.qty });
    }
  }
  return moves.sort((a, b) => (a.bill.date < b.bill.date ? 1 : a.bill.date > b.bill.date ? -1 : 0));
}

/** Current stock: opening + purchased - sold. Can go negative. */
export function itemStock(item: Item, bills: Bill[]) {
  return round2(item.openingStock + itemMoves(item.id, bills).reduce((sum, move) => sum + move.change, 0));
}

export function defaultRate(item: Item, type: BillType) {
  return (type === "sale" ? item.salePrice : item.purchasePrice) ?? 0;
}

export const BILL_META: Record<
  BillType,
  { tab: string; single: string; numberLabel: string; nameLabel: string; namePlaceholder: string; paidWord: string }
> = {
  sale: {
    tab: "Sale",
    single: "Sale bill",
    numberLabel: "Invoice",
    nameLabel: "Customer name",
    namePlaceholder: "Walk-in customer",
    paidWord: "Received",
  },
  purchase: {
    tab: "Purchase",
    single: "Purchase bill",
    numberLabel: "Purchase",
    nameLabel: "Seller name",
    namePlaceholder: "Hardware shop",
    paidWord: "Paid",
  },
  expense: {
    tab: "Expense",
    single: "Expense",
    numberLabel: "Expense",
    nameLabel: "Expense for",
    namePlaceholder: "Diesel, tea, site office rent",
    paidWord: "Paid",
  },
};

export type BillStatus = "paid" | "partly" | "unpaid";

export function billPaid(bill: Bill) {
  return bill.payments.reduce((sum, payment) => sum + payment.amount, 0);
}

export function billDue(bill: Bill) {
  return Math.max(0, Math.round((bill.amount - billPaid(bill)) * 100) / 100);
}

export function billStatus(bill: Bill): BillStatus {
  const paid = billPaid(bill);
  if (paid >= bill.amount - 0.001) return "paid";
  if (paid > 0.001) return "partly";
  return "unpaid";
}

export const STATUS_META: Record<BillStatus, { label: string; className: string }> = {
  paid: { label: "Paid", className: "text-get" },
  partly: { label: "Part paid", className: "text-warn" },
  unpaid: { label: "Unpaid", className: "text-give" },
};

export function billLabel(bill: Pick<Bill, "type" | "number">) {
  return `${BILL_META[bill.type].numberLabel} #${bill.number}`;
}

export function nextBillNumber(bills: Bill[], type: BillType) {
  return bills.reduce((max, bill) => (bill.type === type ? Math.max(max, bill.number) : max), 0) + 1;
}

/**
 * How a bill and its payments show up in the party khata. A sale is money the
 * party owes you; a purchase or expense is money you owe them, booked with the
 * kind that fits their role.
 */
export function khataKinds(type: BillType, role: PartyRole): { bill: EntryKind; payment: EntryKind } {
  if (type === "sale") return { bill: "bill", payment: "receipt" };
  switch (role) {
    case "supplier":
      return { bill: "purchase", payment: "supplier_paid" };
    case "subcontractor":
      return { bill: "sub_bill", payment: "sub_paid" };
    case "labour":
      return { bill: "wages_due", payment: "wages_paid" };
    default:
      return { bill: "got", payment: "gave" };
  }
}

/** "Mehta Developers'", "Raju's". */
export function possessive(name: string) {
  return /s$/i.test(name) ? `${name}'` : `${name}'s`;
}

export function khataNote(bill: Pick<Bill, "type" | "number" | "note"> & { lines?: BillLine[] }) {
  const label = billLabel(bill);
  const detail = bill.note || (bill.lines?.length ? linesSummary(bill.lines) : "");
  return detail ? `${label} — ${detail}` : label;
}

function sampleBill(
  id: string,
  type: BillType,
  number: number,
  partyId: string | null,
  partyName: string,
  siteId: string | null,
  amount: number,
  days: number,
  note: string,
  entryId: string | null,
  paid: [amount: number, days: number][] = [],
  lines: [itemId: string, name: string, unit: string, qty: number, rate: number][] = [],
): Bill {
  const date = daysAgo(days);
  return {
    id,
    type,
    number,
    partyId,
    partyName,
    siteId,
    date,
    amount,
    note,
    entryId,
    lines: lines.map(([itemId, lineName, unit, qty, rate], index) => ({
      id: `${id}-line${index + 1}`,
      itemId,
      name: lineName,
      unit,
      qty,
      rate,
    })),
    payments: paid.map(([value, when], index) => ({
      id: `${id}-pay${index + 1}`,
      amount: value,
      date: daysAgo(when),
      entryId: null,
    })),
    createdAt: `${date}T08:00:00.000Z`,
  };
}

/** Items for the sample books; stock moves come from the sample bills. */
export function sampleItems(): Item[] {
  const createdAt = `${daysAgo(80)}T08:00:00.000Z`;
  return [
    { id: "i-cement", name: "Cement (UltraTech)", unit: "bag", purchasePrice: 480, salePrice: 520, openingStock: 20, createdAt },
    { id: "i-sand", name: "Coarse sand", unit: "trolley", purchasePrice: 18000, salePrice: 19500, openingStock: 0, createdAt },
    { id: "i-tmt", name: "TMT steel", unit: "ton", purchasePrice: 60000, salePrice: 64000, openingStock: 0.5, createdAt },
    { id: "i-aggregate", name: "Aggregate 20mm", unit: "cft", purchasePrice: 78, salePrice: 90, openingStock: 200, createdAt },
    { id: "i-bricks", name: "Bricks", unit: "nos", purchasePrice: 7.5, salePrice: 9, openingStock: 4000, createdAt },
  ];
}

/** Bills matching the sample khata (entry ids from `sampleBooks`). */
export function sampleBills(): Bill[] {
  return [
    sampleBill("b-s1", "sale", 1, "p-sharma", "R.K. Sharma", "s-farm", 240000, 50, "Final bill — farmhouse complete", "e7", [[240000, 40]]),
    sampleBill("b-s2", "sale", 2, "p-mehta", "Mehta Developers", "s-green", 840000, 45, "RA bill 2 — structure up to lintel", "e1", [[500000, 32]]),
    sampleBill("b-s3", "sale", 3, "p-pwd", "PWD Rewari", "s-nh", 350000, 21, "Culvert package", "e5", [[150000, 9]]),
    sampleBill("b-s4", "sale", 4, "p-mehta", "Mehta Developers", "s-green", 620000, 14, "RA bill 3 — Block B slab", "e3", [[200000, 3]]),
    sampleBill("b-p1", "purchase", 1, "p-bharat", "Bharat Cement & Steel", "s-green", 96000, 20, "UltraTech 200 bags", "e9", [[96000, 6]], [
      ["i-cement", "Cement (UltraTech)", "bag", 200, 480],
    ]),
    sampleBill("b-p2", "purchase", 2, "p-yamuna", "Yamuna Sand Suppliers", "s-green", 54000, 18, "3 trolleys coarse sand", "e12", [[54000, 16]], [
      ["i-sand", "Coarse sand", "trolley", 3, 18000],
    ]),
    sampleBill("b-p3", "purchase", 3, "p-bharat", "Bharat Cement & Steel", "s-green", 90000, 11, "TMT steel 1.5 ton", "e10", [[24000, 6]], [
      ["i-tmt", "TMT steel", "ton", 1.5, 60000],
    ]),
    sampleBill("b-p4", "purchase", 4, "p-om", "Om Electricals", "s-green", 38500, 8, "Conduit, wires, DB — Block B", "e14", [[20000, 2]]),
    sampleBill("b-x1", "expense", 1, null, "Diesel for generator", "s-green", 4500, 9, "50 litres", null, [[4500, 9]]),
    sampleBill("b-x2", "expense", 2, null, "Cube test — lab charges", "s-green", 3500, 5, "Slab concrete, 6 cubes", null),
    sampleBill("b-x3", "expense", 3, null, "Tea and snacks", null, 1200, 0, "Site office, this week", null, [[1200, 0]]),
  ];
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function price(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

/** Read the item catalogue from a backup. Older backups have none. */
export function parseItems(value: unknown): Item[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const items: Item[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.id !== "string" || typeof item.name !== "string") return null;
    items.push({
      id: item.id,
      name: item.name.trim(),
      unit: typeof item.unit === "string" ? item.unit : "",
      purchasePrice: price(item.purchasePrice),
      salePrice: price(item.salePrice),
      openingStock: typeof item.openingStock === "number" && Number.isFinite(item.openingStock) ? item.openingStock : 0,
      createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString(),
    });
  }
  return items;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Read bills from a backup. Older backups have none. Links to parties, sites
 * and khata entries that aren't in the backup are dropped. Returns null when
 * the data is malformed.
 */
export function parseBills(
  value: unknown,
  ids: { parties: Set<string>; sites: Set<string>; entries: Set<string>; items: Set<string> },
): Bill[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const bills: Bill[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    if (typeof item.id !== "string" || !BILL_TYPES.includes(item.type as BillType)) return null;
    if (typeof item.amount !== "number" || !Number.isFinite(item.amount) || item.amount <= 0) return null;
    if (typeof item.date !== "string" || !DATE_RE.test(item.date)) return null;
    const payments: BillPayment[] = [];
    for (const pay of Array.isArray(item.payments) ? item.payments : []) {
      if (!isRecord(pay) || typeof pay.id !== "string") return null;
      if (typeof pay.amount !== "number" || !Number.isFinite(pay.amount) || pay.amount <= 0) return null;
      if (typeof pay.date !== "string" || !DATE_RE.test(pay.date)) return null;
      const entryId = typeof pay.entryId === "string" && ids.entries.has(pay.entryId) ? pay.entryId : null;
      payments.push({ id: pay.id, amount: pay.amount, date: pay.date, entryId });
    }
    const lines: BillLine[] = [];
    for (const line of Array.isArray(item.lines) ? item.lines : []) {
      if (!isRecord(line) || typeof line.id !== "string" || typeof line.name !== "string") return null;
      const qty = price(line.qty);
      const rate = price(line.rate);
      if (qty === null || rate === null) return null;
      const itemId = typeof line.itemId === "string" && ids.items.has(line.itemId) ? line.itemId : null;
      lines.push({ id: line.id, itemId, name: line.name, unit: typeof line.unit === "string" ? line.unit : "", qty, rate });
    }
    const partyId = typeof item.partyId === "string" && ids.parties.has(item.partyId) ? item.partyId : null;
    const siteId = typeof item.siteId === "string" && ids.sites.has(item.siteId) ? item.siteId : null;
    const entryId = typeof item.entryId === "string" && ids.entries.has(item.entryId) ? item.entryId : null;
    bills.push({
      id: item.id,
      type: item.type as BillType,
      number: typeof item.number === "number" && item.number > 0 ? Math.floor(item.number) : 1,
      partyId,
      partyName: typeof item.partyName === "string" ? item.partyName : "",
      siteId,
      date: item.date,
      amount: item.amount,
      note: typeof item.note === "string" ? item.note : "",
      entryId,
      lines,
      payments,
      createdAt: typeof item.createdAt === "string" ? item.createdAt : `${item.date}T08:00:00.000Z`,
    });
  }
  return bills;
}
