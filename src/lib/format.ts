export function todayISO(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function daysAgo(days: number, now = new Date()) {
  const d = new Date(now);
  d.setDate(d.getDate() - days);
  return todayISO(d);
}

export function formatINR(value: number) {
  const amount = Math.abs(value);
  const fraction = Number.isInteger(amount) ? 0 : 2;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: fraction,
    minimumFractionDigits: fraction,
  }).format(amount);
}

export function formatDay(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatMonth(key: string) {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return key;
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });
}

export function monthKey(iso: string) {
  return iso.slice(0, 7);
}

export function recentMonths(count = 6, now = new Date()) {
  const out: string[] = [];
  const d = new Date(now.getFullYear(), now.getMonth(), 1);
  for (let i = 0; i < count; i += 1) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    out.push(`${y}-${m}`);
    d.setMonth(d.getMonth() - 1);
  }
  return out;
}

export function formatPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) {
    return `${digits.slice(0, 5)} ${digits.slice(5)}`;
  }
  return phone.trim();
}

export function parseAmount(raw: string) {
  const cleaned = raw.replace(/,/g, "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}
