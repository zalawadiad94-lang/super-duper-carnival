import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Minus, Package, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { DrawerFrame } from "@/components/drawers";
import { Money } from "@/components/money";
import { Button, ConfirmDialog, Field, TextInput } from "@/components/ui";
import {
  billLabel,
  formatQty,
  itemMoves,
  itemStock,
  round2,
  type BillType,
  type Item,
} from "@/lib/bills";
import { cn } from "@/lib/cn";
import { formatDay, formatINR } from "@/lib/format";
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
  onOpen,
}: {
  item: Item;
  stock: number;
  show: "purchase" | "sale" | "both";
  action?: ReactNode;
  onOpen?: () => void;
}) {
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
        <span className="min-w-0">
          <span className="block truncate text-base font-semibold">{item.name}</span>
          {item.unit ? <span className="text-xs text-muted">per {item.unit}</span> : null}
        </span>
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
    onSave({ name, unit, purchasePrice: buy, salePrice: sell, openingStock: opening ?? 0 });
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
      <Field label={initial ? "Opening stock" : "Stock in hand now"}>
        <TextInput inputMode="decimal" value={openingStock} onChange={(event) => setOpeningStock(event.target.value)} placeholder="0" />
      </Field>
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
              stock={itemStock(item, bills)}
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

/** Create / edit an item from the Items page, with its stock history. */
export function ItemDrawer() {
  const form = useUi((state) => state.itemForm);
  const close = useUi((state) => state.closeItemForm);
  const items = useLedger((state) => state.items);
  const bills = useLedger((state) => state.bills);
  const addItem = useLedger((state) => state.addItem);
  const updateItem = useLedger((state) => state.updateItem);
  const deleteItem = useLedger((state) => state.deleteItem);
  const existing = form.id ? items.find((item) => item.id === form.id) : undefined;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    if (form.open) setFormKey((key) => key + 1);
  }, [form.open, form.id]);

  const moves = existing ? itemMoves(existing.id, bills) : [];

  return (
    <>
      <DrawerFrame
        open={form.open}
        onOpenChange={(open) => {
          if (!open) close();
        }}
        title={existing ? existing.name : "New item"}
        lede={
          existing
            ? `In stock: ${formatQty(itemStock(existing, bills), existing.unit)}`
            : "Material or work you buy or sell."
        }
      >
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
              <div className="flex justify-between border-b border-line bg-bg px-3 py-2 text-sm">
                <span className="text-muted">Opening stock</span>
                <span className="font-semibold tabular-nums">{formatQty(existing.openingStock, existing.unit)}</span>
              </div>
              {moves.length === 0 ? (
                <p className="px-3 py-3 text-sm text-muted">Not on any bill yet.</p>
              ) : (
                moves.map(({ bill, line, change }) => (
                  <Link
                    key={line.id}
                    to="/bill/$billId"
                    params={{ billId: bill.id }}
                    onClick={close}
                    className="flex items-center justify-between gap-3 border-b border-line px-3 py-2 text-sm last:border-b-0"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {billLabel(bill)} · {bill.partyName}
                      </span>
                      <span className="text-xs text-muted">
                        {formatDay(bill.date)} · {formatINR(line.rate)} per {line.unit || "unit"}
                      </span>
                    </span>
                    <span className={cn("shrink-0 font-semibold tabular-nums", change > 0 ? "text-get" : "text-give")}>
                      {change > 0 ? "+" : "−"}
                      {formatQty(Math.abs(change), line.unit)}
                    </span>
                  </Link>
                ))
              )}
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
        body="Bills keep their rows for it; it just leaves your item list and stock."
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
    </>
  );
}
