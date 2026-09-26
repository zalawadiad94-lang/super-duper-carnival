import {
  STOCK_EFFECT,
  billLabel,
  round2,
  type Bill,
  type BillLine,
  type Item,
} from "@/lib/bills";
import { daysAgo } from "@/lib/format";

/**
 * Stock that moves without a bill: cement used at site, bags damaged,
 * material returned, or a count correction after checking the godown.
 */
export const ADJUST_REASONS = {
  used: { label: "Used at site", direction: -1 },
  damaged: { label: "Damaged / wasted", direction: -1 },
  returned: { label: "Returned to supplier", direction: -1 },
  received: { label: "Received without bill", direction: 1 },
  site_return: { label: "Came back from site", direction: 1 },
  correction: { label: "Stock count correction", direction: 0 },
} as const;
export type AdjustReason = keyof typeof ADJUST_REASONS;
export const OUT_REASONS: AdjustReason[] = ["used", "damaged", "returned"];
export const IN_REASONS: AdjustReason[] = ["received", "site_return"];

export type StockAdjustment = {
  id: string;
  itemId: string;
  date: string;
  /** Signed quantity: + adds to stock, − takes out. */
  change: number;
  reason: AdjustReason;
  siteId: string | null;
  note: string;
  createdAt: string;
};

export type StockMove =
  | { kind: "bill"; id: string; date: string; change: number; bill: Bill; line: BillLine }
  | { kind: "adjust"; id: string; date: string; change: number; adjustment: StockAdjustment };

/** Every stock movement of one item, newest first. */
export function stockMoves(itemId: string, bills: Bill[], adjustments: StockAdjustment[]): StockMove[] {
  const moves: StockMove[] = [];
  for (const bill of bills) {
    const effect = STOCK_EFFECT[bill.type];
    if (!effect) continue;
    for (const line of bill.lines) {
      if (line.itemId === itemId) {
        moves.push({ kind: "bill", id: line.id, date: bill.date, change: effect * line.qty, bill, line });
      }
    }
  }
  for (const adjustment of adjustments) {
    if (adjustment.itemId === itemId) {
      moves.push({ kind: "adjust", id: adjustment.id, date: adjustment.date, change: adjustment.change, adjustment });
    }
  }
  return moves.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/** Stock now (or at the end of `upTo`, inclusive): opening + all moves. Can go negative. */
export function itemStock(item: Item, bills: Bill[], adjustments: StockAdjustment[], upTo?: string) {
  let stock = item.openingStock;
  for (const move of stockMoves(item.id, bills, adjustments)) {
    if (!upTo || move.date <= upTo) stock += move.change;
  }
  return round2(stock);
}

export type StockLevel = "ok" | "low" | "out";

export function stockLevel(item: Item, stock: number): StockLevel {
  if (stock <= 0) return "out";
  if (item.minStock !== null && stock <= item.minStock) return "low";
  return "ok";
}

export const LEVEL_META: Record<StockLevel, { label: string; className: string }> = {
  ok: { label: "In stock", className: "bg-get-soft text-get" },
  low: { label: "Low stock", className: "bg-warn-soft text-warn" },
  out: { label: "Out of stock", className: "bg-give-soft text-give" },
};

export function moveLabel(move: StockMove) {
  return move.kind === "bill"
    ? `${billLabel(move.bill)} · ${move.bill.partyName}`
    : ADJUST_REASONS[move.adjustment.reason].label;
}

export type ReportRow = {
  item: Item;
  opening: number;
  purchased: number;
  sold: number;
  used: number;
  otherIn: number;
  otherOut: number;
  closing: number;
  value: number;
};

/** Month stock report: opening, purchased, sold, used, other, closing. */
export function stockReport(items: Item[], bills: Bill[], adjustments: StockAdjustment[], month: string): ReportRow[] {
  const dayBefore = (() => {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m - 1, 0);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  return items
    .map((item) => {
      const row: ReportRow = {
        item,
        opening: itemStock(item, bills, adjustments, dayBefore),
        purchased: 0,
        sold: 0,
        used: 0,
        otherIn: 0,
        otherOut: 0,
        closing: 0,
        value: 0,
      };
      for (const move of stockMoves(item.id, bills, adjustments)) {
        if (!move.date.startsWith(month)) continue;
        if (move.kind === "bill") {
          if (move.change > 0) row.purchased += move.change;
          else row.sold -= move.change;
        } else if (move.adjustment.reason === "used") {
          row.used -= move.change;
        } else if (move.change > 0) {
          row.otherIn += move.change;
        } else {
          row.otherOut -= move.change;
        }
      }
      row.closing = round2(row.opening + row.purchased - row.sold - row.used + row.otherIn - row.otherOut);
      row.value = row.closing > 0 ? round2(row.closing * (item.purchasePrice ?? 0)) : 0;
      return row;
    })
    .sort((a, b) => a.item.name.localeCompare(b.item.name));
}

function adjustment(
  id: string,
  itemId: string,
  reason: AdjustReason,
  change: number,
  days: number,
  siteId: string | null,
  note: string,
): StockAdjustment {
  const date = daysAgo(days);
  return { id, itemId, date, change, reason, siteId, note, createdAt: `${date}T09:00:00.000Z` };
}

/** Site use for the sample books (items and bills from `sampleItems` / `sampleBills`). */
export function sampleAdjustments(): StockAdjustment[] {
  return [
    adjustment("a1", "i-cement", "used", -120, 12, "s-green", "Block B slab"),
    adjustment("a2", "i-cement", "used", -40, 4, "s-green", "Plaster, 2nd floor"),
    adjustment("a3", "i-cement", "damaged", -3, 9, null, "Wet bags after rain"),
    adjustment("a4", "i-sand", "used", -2, 10, "s-green", "Slab and plaster"),
    adjustment("a5", "i-tmt", "used", -1.2, 9, "s-green", "Block B slab"),
    adjustment("a6", "i-aggregate", "used", -150, 12, "s-green", "Slab concrete"),
    adjustment("a7", "i-bricks", "used", -2600, 6, "s-green", "2nd floor walls"),
  ];
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Read stock adjustments from a backup. Older backups have none. */
export function parseAdjustments(
  value: unknown,
  ids: { items: Set<string>; sites: Set<string> },
): StockAdjustment[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const out: StockAdjustment[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) return null;
    const row = item as Record<string, unknown>;
    if (typeof row.id !== "string" || typeof row.itemId !== "string") return null;
    if (!ids.items.has(row.itemId)) continue;
    if (typeof row.change !== "number" || !Number.isFinite(row.change)) return null;
    if (typeof row.date !== "string" || !DATE_RE.test(row.date)) return null;
    if (typeof row.reason !== "string" || !(row.reason in ADJUST_REASONS)) return null;
    out.push({
      id: row.id,
      itemId: row.itemId,
      date: row.date,
      change: row.change,
      reason: row.reason as AdjustReason,
      siteId: typeof row.siteId === "string" && ids.sites.has(row.siteId) ? row.siteId : null,
      note: typeof row.note === "string" ? row.note : "",
      createdAt: typeof row.createdAt === "string" ? row.createdAt : `${row.date}T09:00:00.000Z`,
    });
  }
  return out;
}
