import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowDownToLine, ArrowUpFromLine, ClipboardCheck, Minus, Package, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { DrawerFrame } from "@/components/drawers";
import { Money } from "@/components/money";
import { Button, ConfirmDialog, Field, TextInput } from "@/components/ui";
import {
  formatQty,
  round2,
  type BillType,
  type Item,
} from "@/lib/bills";
import { cn } from "@/lib/cn";
import { formatDay, formatINR } from "@/lib/format";
import { LEVEL_META, moveLabel, itemStock, stockLevel, stockMoves } from "@/lib/stock";
import { useLedger, useUi, type ItemInput } from "@/lib/store";

const UNIT_SUGGESTIONS = ["bag", "ton", "kg", "cft", "brass", "trolley", "nos", "sqft", "rft", "hour", "litre"];

function parseNumber(raw: string) {
  const cleaned = raw.replace(/,/g, "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? round2(n) : NaN;
}

export function StockValue({ stock, unit }: { stock: number; unit: string }) {
  return (
    <span className={cn("font-semibold tabular-nums", stock < 0 ? "text-give" : stock === 0 ? "text-muted" : "text-ink")}>
      {formatQty(stock, unit)}
    </span>
  );
}

/** The screenshot-style card: box, name, price, current stock, action. */
export function ItemCard({
  item,
  stock,
  show,
  action,
  footer,
  onOpen,
}: {
  item: Item;
  stock: number;
  show: "purchase" | "sale" | "both";
  action?: ReactNode;
  footer?: ReactNode;
  onOpen?: () => void;
}) {
  const level = stockLevel(item, stock);
  const priceCell = (label: string, value: number | null) => (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      {value === null ? <p className="text-lg text-muted">—</p> : <Money value={value} className="text-lg" />}
    </div>
  );
  return (
    <div className="rounded-2xl border border-line bg-surface p-3 shadow-sm">
      <button type="button" onClick={onOpen} disabled={!onOpen} className="flex w-full items-center gap-3 text-left">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-warn-soft text-warn">
          <Package className="size-7" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-semibold">{item.name}</span>
          {item.unit ? <span className="text-xs text-muted">per {item.unit}</span> : null}
        </span>
        {level !== "ok" ? (
          <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-bold", LEVEL_META[level].className)}>
            {LEVEL_META[level].label}
          </span>
        ) : null}
      </button>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div className={cn("grid flex-1 gap-3", show === "both" ? "grid-cols-3" : "grid-cols-2")}>
          {show !== "sale" ? priceCell("Purchase price", item.purchasePrice) : null}
          {show !== "purchase" ? priceCell("Sale price", item.salePrice) : null}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Current stock</p>
            <p className="text-lg">
              <StockValue stock={stock} unit="" />
            </p>
          </div>
        </div>
        {action}
      </div>
      {footer}
    </div>
  );
}

export function ItemForm({
  initial,
  submitLabel,
  onSave,
}: {
  initial?: Item;
  submitLabel: string;
  onSave: (input: ItemInput) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [unit, setUnit] = useState(initial?.unit ?? "");
  const [purchasePrice, setPurchasePrice] = useState(initial?.purchasePrice != null ? String(initial.purchasePrice) : "");
  const [salePrice, setSalePrice] = useState(initial?.salePrice != null ? String(initial.salePrice) : "");
  const [openingStock, setOpeningStock] = useState(initial ? String(initial.openingStock) : "");
  const [minStock, setMinStock] = useState(initial?.minStock != null ? String(initial.minStock) : "");
  const [error, setError] = useState<string | null>(null);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (!name.trim()) return setError("Item name is required.");
    const buy = parseNumber(purchasePrice);
    const sell = parseNumber(salePrice);
    const opening = parseNumber(openingStock);
    if (Number.isNaN(buy) || (buy !== null && buy < 0)) return setError("Check the purchase price.");
    if (Number.isNaN(sell) || (sell !== null && sell < 0)) return setError("Check the sale price.");
    if (Number.isNaN(opening)) return setError("Check the opening stock.");
    const min = parseNumber(minStock);
    if (Number.isNaN(min) || (min !== null && min < 0)) return setError("Check the low stock level.");
    onSave({ name, unit, purchasePrice: buy, salePrice: sell, openingStock: opening ?? 0, minStock: min });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field label="Item name">
        <TextInput value={name} onChange={(event) => setName(event.target.value)} placeholder="Cement, sand, TMT steel" autoFocus />
      </Field>
      <div className="flex flex-col gap-1.5">
        <Field label="Unit">
          <TextInput value={unit} onChange={(event) => setUnit(event.target.value)} placeholder="bag" />
        </Field>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {UNIT_SUGGESTIONS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setUnit(option)}
              className={cn(
                "h-8 shrink-0 rounded-full px-3 text-xs font-semibold",
                unit === option ? "bg-brass text-bg" : "border border-line bg-surface text-ink",
              )}
            >
              {option}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Purchase price (₹)">
          <TextInput inputMode="decimal" value={purchasePrice} onChange={(event) => setPurchasePrice(event.target.value)} placeholder="0" />
        </Field>
        <Field label="Sale price (₹)">
          <TextInput inputMode="decimal" value={salePrice} onChange={(event) => setSalePrice(event.target.value)} placeholder="0" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={initial ? "Opening stock" : "Stock in hand now"}>
          <TextInput inputMode="decimal" value={openingStock} onChange={(event) => setOpeningStock(event.target.value)} placeholder="0" />
        </Field>
        <Field label="Low stock alert at">
          <TextInput inputMode="decimal" value={minStock} onChange={(event) => setMinStock(event.target.value)} placeholder="Optional" />
        </Field>
      </div>
      {error ? <p className="text-sm text-give">{error}</p> : null}
      <Button type="submit" className="w-full">
        {submitLabel}
      </Button>
    </form>
  );
}

/** "Add items to your bill": search, create new, and ADD / − qty + per item. */
export function ItemPicker({
  type,
  qtyOf,
  onAdd,
  onStep,
  onCreate,
}: {
  type: BillType;
  qtyOf: (itemId: string) => number;
  onAdd: (item: Item) => void;
  onStep: (item: Item, delta: number) => void;
  onCreate: () => void;
}) {
  const items = useLedger((state) => state.items);
  const bills = useLedger((state) => state.bills);
  const adjustments = useLedger((state) => state.stockAdjustments);
  const [query, setQuery] = useState("");
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .filter((item) => !q || item.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [items, query]);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-brass" aria-hidden="true" />
        <TextInput
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search your items"
          className="rounded-full bg-bg pl-10"
        />
      </div>
      <button
        type="button"
        onClick={onCreate}
        className="flex h-12 items-center gap-2 rounded-2xl border border-dashed border-brass bg-brass-soft px-4 text-sm font-bold uppercase tracking-wide text-brass"
      >
        <Plus className="size-5" aria-hidden="true" />
        Create new item
      </button>
      {rows.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted">
          {items.length ? "No item matches." : "No items yet. Create your first one."}
        </p>
      ) : (
        rows.map((item) => {
          const qty = qtyOf(item.id);
          return (
            <ItemCard
              key={item.id}
              item={item}
              stock={itemStock(item, bills, adjustments)}
              show={type === "sale" ? "sale" : "purchase"}
              action={
                qty > 0 ? (
                  <div className="flex h-11 shrink-0 items-center overflow-hidden rounded-xl bg-brass text-bg">
                    <button type="button" className="flex h-full w-10 items-center justify-center" onClick={() => onStep(item, -1)} aria-label={`One less ${item.name}`}>
                      <Minus className="size-4" />
                    </button>
                    <span className="min-w-8 text-center text-sm font-bold tabular-nums">{formatQty(qty)}</span>
                    <button type="button" className="flex h-full w-10 items-center justify-center" onClick={() => onStep(item, 1)} aria-label={`One more ${item.name}`}>
                      <Plus className="size-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => onAdd(item)}
                    className="h-11 shrink-0 rounded-xl border-2 border-brass px-6 text-sm font-bold text-brass"
                  >
                    ADD
                  </button>
                )
              }
            />
          );
        })
      )}
      <p className="text-center text-xs text-muted">
        Rate starts at the item's {type === "sale" ? "sale" : "purchase"} price. Change it on the bill.
      </p>
    </div>
  );
}

/** Create / edit an item, move its stock, and see its stock history. */
export function ItemDrawer() {
  const form = useUi((state) => state.itemForm);
  const close = useUi((state) => state.closeItemForm);
  const openStockForm = useUi((state) => state.openStockForm);
  const items = useLedger((state) => state.items);
  const bills = useLedger((state) => state.bills);
  const adjustments = useLedger((state) => state.stockAdjustments);
  const addItem = useLedger((state) => state.addItem);
  const updateItem = useLedger((state) => state.updateItem);
  const deleteItem = useLedger((state) => state.deleteItem);
  const deleteAdjustment = useLedger((state) => state.deleteAdjustment);
  const existing = form.id ? items.find((item) => item.id === form.id) : undefined;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [removeMove, setRemoveMove] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    if (form.open) setFormKey((key) => key + 1);
  }, [form.open, form.id]);

  const moves = existing ? stockMoves(existing.id, bills, adjustments) : [];
  const stock = existing ? itemStock(existing, bills, adjustments) : 0;
  const level = existing ? stockLevel(existing, stock) : "ok";

  return (
    <>
      <DrawerFrame
        open={form.open}
        onOpenChange={(open) => {
          if (!open) close();
        }}
        title={existing ? existing.name : "New item"}
        lede={existing ? undefined : "Material or work you buy or sell."}
      >
        {existing ? (
          <div className="mb-5 rounded-2xl bg-header p-4 text-bg">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs text-bg/75">Current stock</p>
                <p className="font-display text-3xl">{formatQty(stock, existing.unit)}</p>
                {existing.minStock !== null ? (
                  <p className="text-xs text-bg/75">Alert at {formatQty(existing.minStock, existing.unit)}</p>
                ) : null}
              </div>
              <span className={cn("rounded-full px-2.5 py-1 text-xs font-bold", LEVEL_META[level].className)}>
                {LEVEL_META[level].label}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {(
                [
                  ["out", "Stock out", ArrowUpFromLine],
                  ["in", "Stock in", ArrowDownToLine],
                  ["count", "Count", ClipboardCheck],
                ] as const
              ).map(([mode, label, Icon]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => openStockForm(existing.id, mode)}
                  className="flex h-12 flex-col items-center justify-center rounded-xl bg-surface/15 text-xs font-semibold"
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <ItemForm
          key={formKey}
          initial={existing}
          submitLabel={existing ? "Save item" : "Create item"}
          onSave={(input) => {
            if (existing) {
              updateItem(existing.id, input);
              toast.success("Item saved");
            } else {
              addItem(input);
              toast.success(`${input.name.trim()} created`);
            }
            close();
          }}
        />
        {existing ? (
          <>
            <h3 className="mt-6 font-display text-lg">Stock history</h3>
            <div className="mt-2 overflow-hidden rounded-2xl border border-line">
              {moves.map((move) => {
                const body = (
                  <>
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{moveLabel(move)}</span>
                      <span className="block truncate text-xs text-muted">
                        {formatDay(move.date)}
                        {move.kind === "bill"
                          ? ` · ${formatINR(move.line.rate)} per ${move.line.unit || "unit"}`
                          : move.adjustment.note
                            ? ` · ${move.adjustment.note}`
                            : ""}
                      </span>
                    </span>
                    <span className={cn("shrink-0 font-semibold tabular-nums", move.change > 0 ? "text-get" : "text-give")}>
                      {move.change > 0 ? "+" : "−"}
                      {formatQty(Math.abs(move.change), existing.unit)}
                    </span>
                  </>
                );
                return move.kind === "bill" ? (
                  <Link
                    key={move.id}
                    to="/bill/$billId"
                    params={{ billId: move.bill.id }}
                    onClick={close}
                    className="flex items-center justify-between gap-3 border-b border-line px-3 py-2 text-sm"
                  >
                    {body}
                  </Link>
                ) : (
                  <div key={move.id} className="flex items-center justify-between gap-2 border-b border-line py-2 pl-3 pr-1 text-sm">
                    {body}
                    <button
                      type="button"
                      onClick={() => setRemoveMove(move.id)}
                      className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted"
                      aria-label="Remove this stock entry"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                );
              })}
              <div className="flex justify-between bg-bg px-3 py-2 text-sm">
                <span className="text-muted">Opening stock</span>
                <span className="font-semibold tabular-nums">{formatQty(existing.openingStock, existing.unit)}</span>
              </div>
            </div>
            <Button variant="danger" className="mt-4 w-full" onClick={() => setConfirmDelete(true)}>
              Delete item
            </Button>
          </>
        ) : null}
      </DrawerFrame>
      <ConfirmDialog
        open={confirmDelete}
        title="Delete this item?"
        body="Bills keep their rows for it; it leaves your item list, and its stock entries are removed."
        confirmLabel="Delete"
        danger
        onOpenChange={setConfirmDelete}
        onConfirm={() => {
          if (existing) deleteItem(existing.id);
          setConfirmDelete(false);
          toast.success("Item deleted");
          close();
        }}
      />
      <ConfirmDialog
        open={removeMove !== null}
        title="Remove this stock entry?"
        body="The stock goes back to what it was before it."
        confirmLabel="Remove"
        danger
        onOpenChange={(open) => {
          if (!open) setRemoveMove(null);
        }}
        onConfirm={() => {
          if (removeMove) deleteAdjustment(removeMove);
          setRemoveMove(null);
        }}
      />
    </>
  );
}
