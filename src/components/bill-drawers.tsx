import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, PackagePlus, Send, X } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { DrawerFrame } from "@/components/drawers";
import { ItemForm, ItemPicker } from "@/components/items";
import { PurchaseOrderForm } from "@/components/purchase-order";
import { Money } from "@/components/money";
import { Button, Field, SelectInput, TextArea, TextInput } from "@/components/ui";
import {
  BILL_META,
  BILL_TYPES,
  STOCK_EFFECT,
  billDue,
  billLabel,
  defaultRate,
  formatQty,
  lineTotal,
  nextBillNumber,
  possessive,
  round2,
  type BillLine,
  type BillType,
  type Item,
} from "@/lib/bills";
import { cn } from "@/lib/cn";
import { formatINR, parseAmount, todayISO } from "@/lib/format";
import { ROLE_META, type PartyRole } from "@/lib/model";
import { isSupplierRole } from "@/lib/bills";
import { itemStock } from "@/lib/stock";
import { useLedger, useUi } from "@/lib/store";

type PayMode = "unpaid" | "full" | "part";
type View = "form" | "pick" | "create" | "order";

/** A bill row while editing: qty and rate as typed. */
type DraftLine = Omit<BillLine, "qty" | "rate"> & { qty: string; rate: string };

function toNum(raw: string) {
  const n = Number(raw.replace(/,/g, "").trim());
  return raw.trim() && Number.isFinite(n) ? n : NaN;
}

function draftTotal(lines: DraftLine[]) {
  return round2(
    lines.reduce((sum, line) => {
      const qty = toNum(line.qty);
      const rate = toNum(line.rate);
      return Number.isNaN(qty) || Number.isNaN(rate) ? sum : sum + lineTotal({ qty, rate });
    }, 0),
  );
}

// Who you usually bill, and who usually bills you, listed first.
const ROLE_ORDER: Record<BillType, PartyRole[]> = {
  sale: ["client", "subcontractor", "supplier", "labour"],
  purchase: ["supplier", "subcontractor", "labour", "client"],
  // Suppliers and subcontractors are paid against purchase bills, never as expenses.
  expense: ["labour", "client"],
};

function Chips<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          className={cn(
            "h-11 rounded-xl border text-sm font-semibold",
            value === option.id ? "border-brass bg-brass-soft text-brass" : "border-line text-ink",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function StockHint({ before, after, unit, sale }: { before: number; after: number; unit: string; sale: boolean }) {
  const short = sale && after < 0;
  return (
    <p className={cn("mt-1.5 rounded-lg px-2 py-1 text-xs", short ? "bg-give-soft text-give" : "bg-bg text-muted")}>
      {short
        ? `Only ${formatQty(before, unit)} in stock — stock will go to ${formatQty(after, unit)}`
        : `Stock ${formatQty(before, unit)} → ${formatQty(after, unit)}`}
    </p>
  );
}

export function BillDrawer() {
  const form = useUi((state) => state.billForm);
  const close = useUi((state) => state.closeBillForm);
  const bills = useLedger((state) => state.bills);
  const parties = useLedger((state) => state.parties);
  const sites = useLedger((state) => state.sites);
  const addBill = useLedger((state) => state.addBill);
  const navigate = useNavigate();
  const updateBill = useLedger((state) => state.updateBill);
  const addItem = useLedger((state) => state.addItem);
  const items = useLedger((state) => state.items);
  const adjustments = useLedger((state) => state.stockAdjustments);
  const existing = form.id ? bills.find((bill) => bill.id === form.id) : undefined;

  const [type, setType] = useState<BillType>("sale");
  const [partyId, setPartyId] = useState("");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [number, setNumber] = useState("1");
  const [siteId, setSiteId] = useState("");
  const [note, setNote] = useState("");
  const [payMode, setPayMode] = useState<PayMode>("unpaid");
  const [paidNow, setPaidNow] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [view, setView] = useState<View>("form");

  useEffect(() => {
    if (!form.open) return;
    const bill = existing;
    setLines((bill?.lines ?? []).map((line) => ({ ...line, qty: String(line.qty), rate: String(line.rate) })));
    setView("form");
    const nextType = bill?.type ?? form.type;
    setType(nextType);
    setPartyId(bill?.partyId ?? "");
    setName(bill && !bill.partyId ? bill.partyName : "");
    setAmount(bill ? String(bill.amount) : "");
    setDate(bill?.date ?? todayISO());
    setNumber(String(bill?.number ?? nextBillNumber(bills, nextType)));
    setSiteId(bill?.siteId ?? "");
    setNote(bill?.note ?? "");
    setPayMode(nextType === "expense" ? "full" : "unpaid");
    setPaidNow("");
    setError(null);
    // Reset only when the drawer opens or switches bill, not on every bills change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.open, form.id, form.type]);

  function changeType(next: BillType) {
    setType(next);
    if (!STOCK_EFFECT[next]) setLines([]);
    const current = parties.find((item) => item.id === partyId);
    if (next === "expense" && current && isSupplierRole(current.role)) setPartyId("");
    if (!existing) {
      setNumber(String(nextBillNumber(bills, next)));
      setPayMode(next === "expense" ? "full" : "unpaid");
    }
  }

  const groups = useMemo(
    () =>
      ROLE_ORDER[type].map((role) => ({
        role,
        parties: parties.filter((party) => party.role === role).sort((a, b) => a.name.localeCompare(b.name)),
      })),
    [parties, type],
  );
  const party = parties.find((item) => item.id === partyId);
  const meta = BILL_META[type];
  const hasItems = STOCK_EFFECT[type] !== 0;
  const itemsTotal = draftTotal(lines);

  /** Stock before and after this bill, per item (the bill being edited left out). */
  const stockPreview = useMemo(() => {
    const others = existing ? bills.filter((bill) => bill.id !== existing.id) : bills;
    const preview = new Map<string, { before: number; after: number; unit: string }>();
    for (const line of lines) {
      const item = line.itemId ? items.find((entry) => entry.id === line.itemId) : undefined;
      if (!item) continue;
      const before = preview.get(item.id)?.before ?? itemStock(item, others, adjustments);
      const moved = lines
        .filter((row) => row.itemId === item.id)
        .reduce((sum, row) => sum + (Number.isNaN(toNum(row.qty)) ? 0 : toNum(row.qty)), 0);
      preview.set(item.id, { before, after: round2(before + STOCK_EFFECT[type] * moved), unit: item.unit });
    }
    return preview;
  }, [lines, items, bills, adjustments, existing, type]);

  function qtyOf(itemId: string) {
    return lines.filter((line) => line.itemId === itemId).reduce((sum, line) => sum + (toNum(line.qty) || 0), 0);
  }

  function addLine(item: Item) {
    setLines((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        itemId: item.id,
        name: item.name,
        unit: item.unit,
        qty: "1",
        rate: String(defaultRate(item, type)),
      },
    ]);
  }

  function stepLine(item: Item, delta: number) {
    setLines((current) => {
      const index = current.findIndex((line) => line.itemId === item.id);
      if (index < 0) return current;
      const qty = round2((toNum(current[index].qty) || 0) + delta);
      if (qty <= 0) return current.filter((_, i) => i !== index);
      return current.map((line, i) => (i === index ? { ...line, qty: String(qty) } : line));
    });
  }

  function changeLine(id: string, patch: Partial<DraftLine>) {
    setLines((current) => current.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const finalLines: BillLine[] = [];
    for (const line of hasItems ? lines : []) {
      const qty = toNum(line.qty);
      const rate = toNum(line.rate);
      if (Number.isNaN(qty) || qty <= 0) return setError(`Enter the quantity of ${line.name}.`);
      if (Number.isNaN(rate) || rate < 0) return setError(`Enter the rate of ${line.name}.`);
      finalLines.push({ ...line, qty: round2(qty), rate: round2(rate) });
    }
    const value = finalLines.length ? itemsTotal : parseAmount(amount);
    if (!value) return setError(finalLines.length ? "The items add up to ₹0." : "Enter the bill amount.");
    if (!partyId && !name.trim()) return setError(`Choose a party or type the ${meta.nameLabel.toLowerCase()}.`);
    const num = Number(number);
    if (!Number.isInteger(num) || num < 1) return setError("Bill number must be 1 or more.");
    let paid = 0;
    if (!existing && payMode === "full") paid = value;
    if (!existing && payMode === "part") {
      const part = parseAmount(paidNow);
      if (!part) return setError(`Enter the amount ${meta.paidWord.toLowerCase()} now.`);
      if (part > value) return setError(`${meta.paidWord} can't be more than the bill.`);
      paid = part;
    }
    const input = {
      type,
      number: num,
      partyId: partyId || null,
      partyName: party ? party.name : name,
      siteId: siteId || null,
      date,
      amount: value,
      note,
      lines: finalLines,
    };
    if (existing) {
      updateBill(existing.id, input);
      toast.success(`${billLabel(input)} saved`);
    } else {
      const id = addBill(input, paid);
      toast.success(`${billLabel(input)} added`, {
        action: {
          label: "Send JPG",
          onClick: () => void navigate({ to: "/bill/$billId", params: { billId: id }, search: { send: true } }),
        },
      });
    }
    close();
  }

  return (
    <DrawerFrame
      open={form.open}
      onOpenChange={(open) => {
        if (!open) close();
      }}
      title={
        view === "pick"
          ? "Add items to your bill"
          : view === "create"
            ? "Create new item"
            : view === "order"
              ? "Send purchase order"
            : existing
              ? `Edit ${billLabel(existing)}`
              : `New ${meta.tab.toLowerCase()} bill`
      }
      lede={
        view !== "form"
          ? undefined
          : party
            ? `Also written in ${possessive(party.name)} khata.`
            : "Pick a party to also write it in their khata."
      }
    >
      {view === "pick" ? (
        <div className="flex flex-col gap-3">
          <ItemPicker
            type={type}
            qtyOf={qtyOf}
            onAdd={addLine}
            onStep={stepLine}
            onCreate={() => setView("create")}
          />
          <Button className="sticky bottom-0 w-full shadow-lg" onClick={() => setView("form")}>
            Done · {lines.length} item{lines.length === 1 ? "" : "s"} · <Money value={itemsTotal} className="text-bg" />
          </Button>
        </div>
      ) : view === "order" ? (
        <div className="flex flex-col gap-3">
          <button type="button" onClick={() => setView("form")} className="inline-flex items-center gap-1 text-sm font-semibold text-muted">
            <ChevronLeft className="size-4" aria-hidden="true" />
            Back to bill
          </button>
          <PurchaseOrderForm
            lines={lines.map((line) => ({
              name: line.name,
              unit: line.unit,
              qty: Number.isNaN(toNum(line.qty)) ? 0 : toNum(line.qty),
              rate: Number.isNaN(toNum(line.rate)) ? 0 : toNum(line.rate),
            }))}
            partyId={partyId || null}
            supplierName={name}
            siteId={siteId || null}
            reference={`${BILL_META.purchase.numberLabel} #${number}`}
          />
          <Button variant="ghost" className="w-full border border-line" onClick={() => setView("form")}>
            Back to bill
          </Button>
        </div>
      ) : view === "create" ? (
        <div className="flex flex-col gap-3">
          <button type="button" onClick={() => setView("pick")} className="inline-flex items-center gap-1 text-sm font-semibold text-muted">
            <ChevronLeft className="size-4" aria-hidden="true" />
            Back to items
          </button>
          <ItemForm
            submitLabel="Create and add to bill"
            onSave={(input) => {
              const id = addItem(input);
              addLine({ ...input, id, createdAt: new Date().toISOString() });
              toast.success(`${input.name.trim()} created`);
              setView("pick");
            }}
          />
        </div>
      ) : (
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Chips
          value={type}
          onChange={changeType}
          options={BILL_TYPES.map((id) => ({ id, label: BILL_META[id].tab }))}
        />
        {type === "expense" ? (
          <p className="-mt-2 rounded-xl bg-bg px-3 py-2 text-xs text-muted">
            Paying a supplier or subcontractor isn't an expense — tap <strong>Pay</strong> on their bill in the Purchase
            tab, or add a Purchase bill.
          </p>
        ) : null}
        <Field label="Party">
          <SelectInput value={partyId} onChange={(event) => setPartyId(event.target.value)}>
            <option value="">{type === "expense" ? "No party" : "No party (walk-in / cash)"}</option>
            {groups.map((group) =>
              group.parties.length ? (
                <optgroup key={group.role} label={ROLE_META[group.role].label}>
                  {group.parties.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </optgroup>
              ) : null,
            )}
          </SelectInput>
        </Field>
        {!partyId ? (
          <Field label={meta.nameLabel}>
            <TextInput value={name} onChange={(event) => setName(event.target.value)} placeholder={meta.namePlaceholder} />
          </Field>
        ) : null}
        {hasItems ? (
          <div className="rounded-2xl border border-line bg-bg p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Items</p>
              {lines.length ? <p className="text-xs text-muted">{lines.length} on this bill</p> : null}
            </div>
            {lines.map((line) => (
              <div key={line.id} className="mt-2 rounded-xl border border-line bg-surface p-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 truncate text-sm font-semibold">{line.name}</p>
                  <button
                    type="button"
                    onClick={() => setLines((current) => current.filter((item) => item.id !== line.id))}
                    className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted"
                    aria-label={`Remove ${line.name}`}
                  >
                    <X className="size-4" />
                  </button>
                </div>
                <div className="mt-1 grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                  <label className="text-xs text-muted">
                    Qty{line.unit ? ` (${line.unit})` : ""}
                    <TextInput inputMode="decimal" value={line.qty} onChange={(event) => changeLine(line.id, { qty: event.target.value })} className="mt-1 h-10" />
                  </label>
                  <label className="text-xs text-muted">
                    Rate (₹)
                    <TextInput inputMode="decimal" value={line.rate} onChange={(event) => changeLine(line.id, { rate: event.target.value })} className="mt-1 h-10" />
                  </label>
                  <Money
                    value={Number.isNaN(toNum(line.qty) * toNum(line.rate)) ? 0 : lineTotal({ qty: toNum(line.qty), rate: toNum(line.rate) })}
                    className="pb-2 text-base"
                  />
                </div>
                {line.itemId && stockPreview.get(line.itemId) ? (
                  <StockHint {...stockPreview.get(line.itemId)!} sale={type === "sale"} />
                ) : null}
              </div>
            ))}
            <Button variant="soft" className="mt-2 w-full" onClick={() => setView("pick")}>
              <PackagePlus className="size-4" aria-hidden="true" />
              {lines.length ? "Add more items" : "Add items"}
            </Button>
            {type === "purchase" && lines.length ? (
              <Button variant="navy" className="mt-2 w-full" onClick={() => setView("order")}>
                <Send className="size-4" aria-hidden="true" />
                Send purchase order
              </Button>
            ) : null}
            {lines.length ? (
              <p className="mt-2 text-right text-xs text-muted">
                {type === "sale" ? "Stock goes down" : "Stock goes up"} by these quantities
              </p>
            ) : null}
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          {hasItems && lines.length ? (
            <div className="flex flex-col gap-1.5 text-sm font-medium">
              Total
              <div className="flex h-12 items-center rounded-xl bg-brass-soft px-3">
                <Money value={itemsTotal} className="text-lg text-brass" />
              </div>
            </div>
          ) : (
            <Field label="Amount (₹)">
              <TextInput inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0" />
            </Field>
          )}
          <Field label={`${meta.numberLabel} no.`}>
            <TextInput inputMode="numeric" value={number} onChange={(event) => setNumber(event.target.value.replace(/\D/g, ""))} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            <TextInput type="date" value={date} max={todayISO()} onChange={(event) => setDate(event.target.value || todayISO())} />
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
        </div>
        <Field label="Details">
          <TextArea
            value={note}
            maxLength={240}
            onChange={(event) => setNote(event.target.value)}
            placeholder={type === "sale" ? "RA bill, work done, measurement" : "Items, quantity, rate"}
          />
        </Field>
        {!existing ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">{meta.paidWord} now?</p>
            <Chips
              value={payMode}
              onChange={setPayMode}
              options={[
                { id: "unpaid", label: "Unpaid" },
                { id: "full", label: "Full" },
                { id: "part", label: "Part" },
              ]}
            />
            {payMode === "part" ? (
              <TextInput
                inputMode="decimal"
                value={paidNow}
                onChange={(event) => setPaidNow(event.target.value)}
                placeholder={`Amount ${meta.paidWord.toLowerCase()}`}
                aria-label={`Amount ${meta.paidWord.toLowerCase()} now`}
              />
            ) : null}
          </div>
        ) : null}
        {error ? <p className="text-sm text-give">{error}</p> : null}
        <Button type="submit" className="w-full">
          {existing ? "Save bill" : "Add bill"}
        </Button>
      </form>
      )}
    </DrawerFrame>
  );
}

export function PaymentDrawer() {
  const form = useUi((state) => state.paymentForm);
  const close = useUi((state) => state.closePaymentForm);
  const bills = useLedger((state) => state.bills);
  const addBillPayment = useLedger((state) => state.addBillPayment);
  const bill = form.billId ? bills.find((item) => item.id === form.billId) : undefined;
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!form.open) return;
    setAmount(bill ? String(billDue(bill)) : "");
    setDate(todayISO());
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.open, form.billId]);

  if (!bill) return null;
  const due = billDue(bill);
  const word = BILL_META[bill.type].paidWord;

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!bill) return;
    const value = parseAmount(amount);
    if (!value) return setError("Enter the amount.");
    if (value > due + 0.001) return setError(`Only ${formatINR(due)} is due on this bill.`);
    addBillPayment(bill.id, { amount: value, date });
    toast.success(`${formatINR(value)} ${word.toLowerCase()}`);
    close();
  }

  return (
    <DrawerFrame
      open={form.open}
      onOpenChange={(open) => {
        if (!open) close();
      }}
      title={bill.type === "sale" ? "Payment received" : "Payment made"}
      lede={`${billLabel(bill)} · ${formatINR(due)} due`}
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label={`Amount ${word.toLowerCase()} (₹)`}>
          <TextInput inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} autoFocus />
        </Field>
        <Field label="Date">
          <TextInput type="date" value={date} max={todayISO()} onChange={(event) => setDate(event.target.value || todayISO())} />
        </Field>
        {error ? <p className="text-sm text-give">{error}</p> : null}
        <Button type="submit" className="w-full">
          Save payment
        </Button>
      </form>
    </DrawerFrame>
  );
}
