import { useEffect, useMemo, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { DrawerFrame } from "@/components/drawers";
import { ItemCard } from "@/components/items";
import { Money } from "@/components/money";
import { Button, EmptyState, Field, SelectInput, TextArea, TextInput } from "@/components/ui";
import { formatQty, round2 } from "@/lib/bills";
import { cn } from "@/lib/cn";
import { formatMonth, recentMonths, todayISO } from "@/lib/format";
import {
  ADJUST_REASONS,
  IN_REASONS,
  OUT_REASONS,
  itemStock,
  stockLevel,
  stockReport,
  type AdjustReason,
} from "@/lib/stock";
import { useLedger, useUi, type StockMode } from "@/lib/store";

const MODES: { id: StockMode; label: string }[] = [
  { id: "out", label: "Stock out" },
  { id: "in", label: "Stock in" },
  { id: "count", label: "Count" },
];

function toNum(raw: string) {
  const n = Number(raw.replace(/,/g, "").trim());
  return raw.trim() && Number.isFinite(n) ? round2(n) : NaN;
}

/** Take stock out (used at site, damaged…), put it in, or correct it after a count. */
export function StockDrawer() {
  const form = useUi((state) => state.stockForm);
  const close = useUi((state) => state.closeStockForm);
  const openItemForm = useUi((state) => state.openItemForm);
  const items = useLedger((state) => state.items);
  const bills = useLedger((state) => state.bills);
  const adjustments = useLedger((state) => state.stockAdjustments);
  const sites = useLedger((state) => state.sites);
  const addAdjustment = useLedger((state) => state.addAdjustment);

  const [mode, setMode] = useState<StockMode>("out");
  const [itemId, setItemId] = useState("");
  const [reason, setReason] = useState<AdjustReason>("used");
  const [qty, setQty] = useState("");
  const [siteId, setSiteId] = useState("");
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!form.open) return;
    setMode(form.mode);
    setItemId(form.itemId ?? "");
    setReason(form.mode === "in" ? "received" : form.mode === "count" ? "correction" : "used");
    setQty("");
    setSiteId(sites.find((site) => site.status === "active")?.id ?? "");
    setDate(todayISO());
    setNote("");
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.open, form.itemId, form.mode]);

  function changeMode(next: StockMode) {
    setMode(next);
    setReason(next === "in" ? "received" : next === "count" ? "correction" : "used");
  }

  const item = items.find((entry) => entry.id === itemId);
  const stock = item ? itemStock(item, bills, adjustments) : 0;
  const amount = toNum(qty);
  const change = Number.isNaN(amount)
    ? 0
    : mode === "count"
      ? round2(amount - stock)
      : mode === "in"
        ? amount
        : -amount;
  const after = round2(stock + change);
  const showSite = reason === "used" || reason === "site_return";

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!item) return setError("Choose an item.");
    if (Number.isNaN(amount) || amount < 0 || (mode !== "count" && amount === 0)) {
      return setError(mode === "count" ? "Enter the stock you counted." : "Enter the quantity.");
    }
    if (mode === "count" && change === 0)
      return setError("That matches the stock already. Nothing to change.");
    addAdjustment({
      itemId: item.id,
      date,
      change,
      reason,
      siteId: showSite ? siteId || null : null,
      note,
    });
    toast.success(`${item.name}: ${formatQty(after, item.unit)} in stock`);
    close();
    openItemForm(item.id);
  }

  const reasons = mode === "out" ? OUT_REASONS : mode === "in" ? IN_REASONS : [];

  return (
    <DrawerFrame
      open={form.open}
      onOpenChange={(open) => {
        if (!open) close();
      }}
      title={mode === "count" ? "Stock count" : mode === "in" ? "Stock in" : "Stock out"}
      lede={
        mode === "count"
          ? "Counted the godown? Enter what is really there; the difference is recorded."
          : mode === "in"
            ? "Material that came in without a purchase bill."
            : "Material used at site, damaged, or sent back."
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-2">
          {MODES.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => changeMode(option.id)}
              className={cn(
                "flex h-11 items-center justify-center gap-1.5 rounded-xl border text-sm font-semibold",
                mode === option.id ? "border-brass bg-brass-soft text-brass" : "border-line",
              )}
            >
              {option.id === "out" ? (
                <ArrowUpFromLine className="size-4" aria-hidden="true" />
              ) : null}
              {option.id === "in" ? (
                <ArrowDownToLine className="size-4" aria-hidden="true" />
              ) : null}
              {option.label}
            </button>
          ))}
        </div>
        <Field label="Item">
          <SelectInput value={itemId} onChange={(event) => setItemId(event.target.value)}>
            <option value="">Choose item</option>
            {[...items]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
          </SelectInput>
        </Field>
        {reasons.length ? (
          <div className="flex flex-wrap gap-2">
            {reasons.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setReason(option)}
                className={cn(
                  "h-9 rounded-full px-3 text-sm font-semibold",
                  reason === option ? "bg-ink text-bg" : "border border-line bg-surface",
                )}
              >
                {ADJUST_REASONS[option].label}
              </button>
            ))}
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <Field
            label={
              mode === "count"
                ? `Counted stock${item?.unit ? ` (${item.unit})` : ""}`
                : `Quantity${item?.unit ? ` (${item.unit})` : ""}`
            }
          >
            <TextInput
              inputMode="decimal"
              value={qty}
              onChange={(event) => setQty(event.target.value)}
              placeholder="0"
              autoFocus
            />
          </Field>
          <Field label="Date">
            <TextInput
              type="date"
              value={date}
              max={todayISO()}
              onChange={(event) => setDate(event.target.value || todayISO())}
            />
          </Field>
        </div>
        {item ? (
          <div
            className={cn(
              "flex items-center justify-between rounded-xl px-3 py-3 text-sm",
              after < 0 ? "bg-give-soft text-give" : "bg-brass-soft text-ink",
            )}
          >
            <span>Stock</span>
            <span className="font-semibold tabular-nums">
              {formatQty(stock, item.unit)} → {formatQty(after, item.unit)}
            </span>
          </div>
        ) : null}
        {after < 0 && item ? (
          <p className="-mt-2 text-xs text-give">
            Only {formatQty(stock, item.unit)} in stock — it will show as negative.
          </p>
        ) : null}
        {showSite ? (
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
        ) : null}
        <Field label="Note">
          <TextArea
            value={note}
            maxLength={200}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Slab casting, 2nd floor plaster…"
          />
        </Field>
        {error ? <p className="text-sm text-give">{error}</p> : null}
        <Button type="submit" className="w-full">
          Save
        </Button>
      </form>
    </DrawerFrame>
  );
}

const FILTERS = [
  { id: "all", label: "All" },
  { id: "low", label: "Low stock" },
  { id: "out", label: "Out of stock" },
] as const;

/** The Stock tab: every item with its stock, alerts, and a month report. */
export function StockRegister() {
  const items = useLedger((state) => state.items);
  const bills = useLedger((state) => state.bills);
  const adjustments = useLedger((state) => state.stockAdjustments);
  const openItemForm = useUi((state) => state.openItemForm);
  const openStockForm = useUi((state) => state.openStockForm);
  const [view, setView] = useState<"items" | "report">("items");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const months = recentMonths(12);
  const [month, setMonth] = useState(months[0]);

  const withStock = useMemo(
    () =>
      items
        .map((item) => {
          const stock = itemStock(item, bills, adjustments);
          return { item, stock, level: stockLevel(item, stock) };
        })
        .sort((a, b) => a.item.name.localeCompare(b.item.name)),
    [items, bills, adjustments],
  );
  const stockValue = withStock.reduce(
    (sum, { item, stock }) => sum + (stock > 0 ? stock * (item.purchasePrice ?? 0) : 0),
    0,
  );
  const lowCount = withStock.filter(({ level }) => level === "low").length;
  const outCount = withStock.filter(({ level }) => level === "out").length;
  const rows = withStock.filter(({ item, level }) => {
    if (filter !== "all" && level !== filter) return false;
    const q = query.trim().toLowerCase();
    return !q || item.name.toLowerCase().includes(q);
  });
  const report = useMemo(
    () => stockReport(items, bills, adjustments, month),
    [items, bills, adjustments, month],
  );

  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl border border-line bg-surface px-3 py-3">
          <Money value={stockValue} tone="get" className="block truncate text-lg" />
          <p className="text-xs text-muted">Stock value</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setView("items");
            setFilter("low");
          }}
          className="rounded-2xl border border-line bg-surface px-3 py-3 text-left"
        >
          <p className={cn("font-display text-lg", lowCount ? "text-warn" : "text-ink")}>
            {lowCount}
          </p>
          <p className="text-xs text-muted">Low stock</p>
        </button>
        <button
          type="button"
          onClick={() => {
            setView("items");
            setFilter("out");
          }}
          className="rounded-2xl border border-line bg-surface px-3 py-3 text-left"
        >
          <p className={cn("font-display text-lg", outCount ? "text-give" : "text-ink")}>
            {outCount}
          </p>
          <p className="text-xs text-muted">Out of stock</p>
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="soft" onClick={() => openStockForm(null, "out")}>
          <ArrowUpFromLine className="size-4" aria-hidden="true" />
          Stock out
        </Button>
        <Button variant="soft" onClick={() => openStockForm(null, "in")}>
          <ArrowDownToLine className="size-4" aria-hidden="true" />
          Stock in
        </Button>
      </div>

      <div className="mt-3 grid grid-cols-2 rounded-xl border border-line bg-surface p-1">
        {(["items", "report"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setView(option)}
            className={cn(
              "h-9 rounded-lg text-sm font-semibold",
              view === option ? "bg-ink text-bg" : "text-muted",
            )}
          >
            {option === "items" ? "Items" : "Stock report"}
          </button>
        ))}
      </div>

      {view === "items" ? (
        <>
          <div className="mt-3 flex flex-col gap-2">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-brass"
                aria-hidden="true"
              />
              <TextInput
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search your items"
                className="rounded-full pl-10"
              />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {FILTERS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setFilter(option.id)}
                  className={cn(
                    "h-9 shrink-0 rounded-full px-3 text-sm font-semibold",
                    filter === option.id
                      ? "bg-ink text-bg"
                      : "border border-line bg-surface text-ink",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          {items.length === 0 ? (
            <div className="mt-3">
              <EmptyState
                title="No items yet"
                body="Add cement, sand, steel — anything you buy, sell or use. Purchase bills add stock; sales and site use take it out."
                action={<Button onClick={() => openItemForm(null)}>Create item</Button>}
              />
            </div>
          ) : rows.length === 0 ? (
            <p className="mt-6 text-sm text-muted">Nothing here.</p>
          ) : (
            <div className="mt-3 flex flex-col gap-2">
              {rows.map(({ item, stock }) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  stock={stock}
                  show="both"
                  onOpen={() => openItemForm(item.id)}
                  footer={
                    <div className="mt-3 grid grid-cols-2 gap-2 border-t border-line pt-3">
                      <button
                        type="button"
                        onClick={() => openStockForm(item.id, "out")}
                        className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-give-soft text-sm font-semibold text-give"
                      >
                        <ArrowUpFromLine className="size-4" aria-hidden="true" />
                        Out
                      </button>
                      <button
                        type="button"
                        onClick={() => openStockForm(item.id, "in")}
                        className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-get-soft text-sm font-semibold text-get"
                      >
                        <ArrowDownToLine className="size-4" aria-hidden="true" />
                        In
                      </button>
                    </div>
                  }
                />
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="mt-3">
          <SelectInput
            value={month}
            onChange={(event) => setMonth(event.target.value)}
            aria-label="Month"
          >
            {months.map((option) => (
              <option key={option} value={option}>
                {formatMonth(option)}
              </option>
            ))}
          </SelectInput>
          {report.length === 0 ? (
            <p className="mt-6 text-sm text-muted">No items yet.</p>
          ) : (
            <div className="mt-3 overflow-x-auto rounded-2xl border border-line bg-surface">
              <table className="w-full min-w-[34rem] text-right text-sm tabular-nums">
                <thead className="bg-brass-soft text-xs font-semibold uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-3 py-2 text-left">Item</th>
                    <th className="px-2 py-2">Opening</th>
                    <th className="px-2 py-2 text-get">Bought</th>
                    <th className="px-2 py-2 text-give">Sold</th>
                    <th className="px-2 py-2 text-give">Used</th>
                    <th className="px-2 py-2">Other ±</th>
                    <th className="px-3 py-2">Closing</th>
                  </tr>
                </thead>
                <tbody>
                  {report.map((row) => {
                    const other = round2(row.otherIn - row.otherOut);
                    return (
                      <tr key={row.item.id} className="border-t border-line">
                        <td className="px-3 py-2 text-left">
                          <span className="block font-medium">{row.item.name}</span>
                          {row.item.unit ? (
                            <span className="text-xs text-muted">{row.item.unit}</span>
                          ) : null}
                        </td>
                        <td className="px-2 py-2">{formatQty(row.opening)}</td>
                        <td className="px-2 py-2 text-get">
                          {row.purchased ? `+${formatQty(row.purchased)}` : "—"}
                        </td>
                        <td className="px-2 py-2 text-give">
                          {row.sold ? `−${formatQty(row.sold)}` : "—"}
                        </td>
                        <td className="px-2 py-2 text-give">
                          {row.used ? `−${formatQty(row.used)}` : "—"}
                        </td>
                        <td className="px-2 py-2">
                          {other ? `${other > 0 ? "+" : "−"}${formatQty(Math.abs(other))}` : "—"}
                        </td>
                        <td
                          className={cn(
                            "px-3 py-2 font-semibold",
                            row.closing < 0 ? "text-give" : "text-ink",
                          )}
                        >
                          {formatQty(row.closing)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-line bg-bg">
                    <td
                      className="px-3 py-2 text-left text-xs font-semibold uppercase text-muted"
                      colSpan={6}
                    >
                      Closing stock value
                    </td>
                    <td className="px-3 py-2">
                      <Money value={report.reduce((sum, row) => sum + row.value, 0)} tone="get" />
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          <p className="mt-2 text-xs text-muted">
            Bought and sold come from bills. Used, damaged, returned and counts come from Stock out
            / in.
          </p>
        </div>
      )}

      {view === "items" ? (
        <button
          type="button"
          onClick={() => openItemForm(null)}
          className="fixed bottom-20 right-4 z-20 flex h-14 items-center gap-2 rounded-full bg-brass px-5 text-sm font-semibold text-bg shadow-lg lg:hidden"
        >
          <Plus className="size-5" aria-hidden="true" />
          New item
        </button>
      ) : null}
    </div>
  );
}
