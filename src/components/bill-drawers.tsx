import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { DrawerFrame } from "@/components/drawers";
import { Button, Field, SelectInput, TextArea, TextInput } from "@/components/ui";
import { BILL_META, BILL_TYPES, billDue, billLabel, nextBillNumber, possessive, type BillType } from "@/lib/bills";
import { cn } from "@/lib/cn";
import { formatINR, parseAmount, todayISO } from "@/lib/format";
import { ROLE_META, type PartyRole } from "@/lib/model";
import { useLedger, useUi } from "@/lib/store";

type PayMode = "unpaid" | "full" | "part";

// Who you usually bill, and who usually bills you, listed first.
const ROLE_ORDER: Record<BillType, PartyRole[]> = {
  sale: ["client", "subcontractor", "supplier", "labour"],
  purchase: ["supplier", "subcontractor", "labour", "client"],
  expense: ["supplier", "subcontractor", "labour", "client"],
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

export function BillDrawer() {
  const form = useUi((state) => state.billForm);
  const close = useUi((state) => state.closeBillForm);
  const bills = useLedger((state) => state.bills);
  const parties = useLedger((state) => state.parties);
  const sites = useLedger((state) => state.sites);
  const addBill = useLedger((state) => state.addBill);
  const updateBill = useLedger((state) => state.updateBill);
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

  useEffect(() => {
    if (!form.open) return;
    const bill = existing;
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

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const value = parseAmount(amount);
    if (!value) return setError("Enter the bill amount.");
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
    };
    if (existing) {
      updateBill(existing.id, input);
      toast.success(`${billLabel(input)} saved`);
    } else {
      addBill(input, paid);
      toast.success(`${billLabel(input)} added`);
    }
    close();
  }

  return (
    <DrawerFrame
      open={form.open}
      onOpenChange={(open) => {
        if (!open) close();
      }}
      title={existing ? `Edit ${billLabel(existing)}` : "New bill"}
      lede={party ? `Also written in ${possessive(party.name)} khata.` : "Pick a party to also write it in their khata."}
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Chips
          value={type}
          onChange={changeType}
          options={BILL_TYPES.map((id) => ({ id, label: BILL_META[id].tab }))}
        />
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
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount (₹)">
            <TextInput inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0" />
          </Field>
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
