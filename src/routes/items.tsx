import { useMemo, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ChevronLeft, Plus, Search } from "lucide-react";
import { ItemCard } from "@/components/items";
import { Money } from "@/components/money";
import { Button, EmptyState, PageIntro, TextInput } from "@/components/ui";
import { itemStock } from "@/lib/bills";
import { cn } from "@/lib/cn";
import { useLedger, useUi } from "@/lib/store";

export const Route = createFileRoute("/items")({ component: ItemsPage });

const FILTERS = [
  { id: "all", label: "All" },
  { id: "in", label: "In stock" },
  { id: "out", label: "Out / negative" },
] as const;

function ItemsPage() {
  const items = useLedger((state) => state.items);
  const bills = useLedger((state) => state.bills);
  const openItemForm = useUi((state) => state.openItemForm);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");

  const withStock = useMemo(
    () => items.map((item) => ({ item, stock: itemStock(item, bills) })).sort((a, b) => a.item.name.localeCompare(b.item.name)),
    [items, bills],
  );
  const stockValue = withStock.reduce((sum, { item, stock }) => sum + (stock > 0 ? stock * (item.purchasePrice ?? 0) : 0), 0);
  const outCount = withStock.filter(({ stock }) => stock <= 0).length;
  const rows = withStock.filter(({ item, stock }) => {
    if (filter === "in" && stock <= 0) return false;
    if (filter === "out" && stock > 0) return false;
    const q = query.trim().toLowerCase();
    return !q || item.name.toLowerCase().includes(q);
  });

  return (
    <div className="mx-auto max-w-3xl pb-16 lg:pb-0">
      <Link to="/bills" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-muted">
        <ChevronLeft className="size-4" aria-hidden="true" />
        Bills
      </Link>
      <div className="flex items-end justify-between gap-3">
        <PageIntro title="Items & stock" lede="Stock goes up with purchase bills and down with sale bills." />
        <Button className="mb-4 hidden shrink-0 lg:inline-flex" onClick={() => openItemForm(null)}>
          <Plus className="size-4" aria-hidden="true" />
          New item
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl border border-line bg-surface px-3 py-3">
          <p className="font-display text-lg">{items.length}</p>
          <p className="text-xs text-muted">Items</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface px-3 py-3">
          <Money value={stockValue} tone="get" className="block truncate text-lg" />
          <p className="text-xs text-muted">Stock value</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface px-3 py-3">
          <p className={cn("font-display text-lg", outCount ? "text-give" : "text-ink")}>{outCount}</p>
          <p className="text-xs text-muted">Out of stock</p>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-brass" aria-hidden="true" />
          <TextInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search your items" className="rounded-full pl-10" />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              className={cn(
                "h-9 shrink-0 rounded-full px-3 text-sm font-semibold",
                filter === item.id ? "bg-ink text-bg" : "border border-line bg-surface text-ink",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title="No items yet"
            body="Add cement, sand, steel — anything you buy or sell. Then add them to purchase and sale bills."
            action={<Button onClick={() => openItemForm(null)}>Create item</Button>}
          />
        </div>
      ) : rows.length === 0 ? (
        <p className="mt-6 text-sm text-muted">Nothing matches.</p>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {rows.map(({ item, stock }) => (
            <ItemCard key={item.id} item={item} stock={stock} show="both" onOpen={() => openItemForm(item.id)} />
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => openItemForm(null)}
        className="fixed bottom-20 right-4 z-20 flex h-14 items-center gap-2 rounded-full bg-brass px-5 text-sm font-semibold text-bg shadow-lg lg:hidden"
      >
        <Plus className="size-5" aria-hidden="true" />
        New item
      </button>
    </div>
  );
}
