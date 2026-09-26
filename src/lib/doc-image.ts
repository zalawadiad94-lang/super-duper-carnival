import { formatQty, lineTotal, round2, type BillLine } from "@/lib/bills";
import { formatDay, formatINR } from "@/lib/format";

/**
 * Draws business documents (invoice, purchase bill, expense voucher,
 * purchase order) as a JPG that can be sent on WhatsApp.
 */

export type OrderLine = Pick<BillLine, "name" | "unit" | "qty" | "rate">;

export type DocBox = { label: string; main: string; sub?: string; accent?: string };

export type DocRow = { name: string; qty?: string; rate?: number; amount?: number };

export type DocTotal = { label: string; value: number; tone?: "ink" | "get" | "give" | "blue"; big?: boolean };

export type DocSpec = {
  title: string;
  business: string;
  refLabel: string;
  ref: string;
  date: string;
  left: DocBox;
  right?: DocBox;
  /** "qty": item + qty; "full": item, qty, rate, amount; "amount": details + amount. */
  columns: "qty" | "full" | "amount";
  rows: DocRow[];
  totals: DocTotal[];
  stamp?: { text: string; color: string };
  note: string;
  footer: string[];
  signature: boolean;
};

const W = 1080;
const PAD = 64;
const SANS = '"Outfit Variable", "Outfit", system-ui, sans-serif';
const SERIF = '"Fraunces Variable", "Fraunces", Georgia, serif';
const INK = "#0f1d45";
const MUTED = "#5a6788";
const LINE = "#dce3f1";
const BLUE = "#2455e6";
const SOFT = "#e7eeff";
const GREEN = "#0c8a4c";
const RED = "#d9362b";
const TONES = { ink: INK, get: GREEN, give: RED, blue: BLUE };

function font(weight: number, size: number, family = SANS) {
  return `${weight} ${size}px ${family}`;
}

/** Rounded rectangle path; plain rectangle on WebViews without roundRect. */
function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

/** Letter spacing where supported (older WebViews ignore it). */
function spacing(ctx: CanvasRenderingContext2D, value: string) {
  if ("letterSpacing" in ctx) ctx.letterSpacing = value;
}

/** Cut text to fit `max` pixels, adding an ellipsis. */
function fit(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text;
  let out = text;
  while (out.length > 1 && ctx.measureText(`${out}…`).width > max) out = out.slice(0, -1);
  return `${out}…`;
}

/** Wrap text into lines no wider than `max` pixels. */
function wrap(ctx: CanvasRenderingContext2D, text: string, max: number) {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width > max && line) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    lines.push(line);
  }
  return lines;
}

async function loadFonts() {
  try {
    await Promise.all([
      document.fonts.load(font(600, 40, SERIF)),
      document.fonts.load(font(400, 28)),
      document.fonts.load(font(700, 28)),
    ]);
  } catch {
    // System fonts are fine.
  }
}

/** Draw a document and return it as a JPEG data URL. */
export async function renderDocument(doc: DocSpec): Promise<string> {
  await loadFonts();
  const canvas = document.createElement("canvas");
  const measure = canvas.getContext("2d")!;

  const cols =
    doc.columns === "full"
      ? { item: PAD + 84, qty: W - PAD - 400, rate: W - PAD - 200, amount: W - PAD - 24 }
      : doc.columns === "qty"
        ? { item: PAD + 84, qty: W - PAD - 24, rate: 0, amount: 0 }
        : { item: PAD + 84, qty: 0, rate: 0, amount: W - PAD - 24 };
  const itemRight = doc.columns === "full" ? cols.qty - 190 : doc.columns === "qty" ? cols.qty - 220 : cols.amount - 260;
  const itemMax = itemRight - cols.item;
  measure.font = font(600, 28);
  const names = doc.rows.map((row) => {
    const wrapped = wrap(measure, row.name, itemMax);
    return wrapped.length > 2 ? [wrapped[0], fit(measure, wrapped.slice(1).join(" "), itemMax)] : wrapped;
  });
  const rowHeights = names.map((lines) => (lines.length > 1 ? 104 : 76));
  measure.font = font(400, 26);
  const noteLines = doc.note ? wrap(measure, doc.note, W - PAD * 2) : [];

  const headerH = 250;
  const boxH = 160;
  const tableH = 64 + rowHeights.reduce((sum, h) => sum + h, 0);
  const totalsH = doc.totals.length ? 30 + doc.totals.reduce((sum, t) => sum + (t.big ? 76 : 56), 0) : 0;
  const noteH = noteLines.length ? 80 + noteLines.length * 36 : 0;
  const footerH = 40 + doc.footer.length * 40 + (doc.signature ? 170 : 40);
  const H = headerH + 40 + boxH + 40 + tableH + totalsH + noteH + footerH + 30;

  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  // Header band
  const grad = ctx.createLinearGradient(0, 0, W, headerH);
  grad.addColorStop(0, "#0f1d45");
  grad.addColorStop(0.6, "#16307a");
  grad.addColorStop(1, "#2455e6");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, headerH);
  ctx.fillStyle = "#9db8ff";
  ctx.font = font(700, 24);
  spacing(ctx, "6px");
  ctx.fillText(doc.title.toUpperCase(), PAD, 84);
  spacing(ctx, "0px");
  ctx.fillStyle = "#ffffff";
  ctx.font = font(600, 56, SERIF);
  ctx.fillText(fit(ctx, doc.business, W - PAD * 2 - 340), PAD, 158);
  ctx.textAlign = "right";
  ctx.font = font(400, 24);
  ctx.fillStyle = "#c9d6ff";
  ctx.fillText(doc.refLabel, W - PAD, 84);
  ctx.fillText("Date", W - PAD, 172);
  ctx.fillStyle = "#ffffff";
  ctx.font = font(700, 32);
  ctx.fillText(fit(ctx, doc.ref || "—", 320), W - PAD, 124);
  ctx.fillText(formatDay(doc.date), W - PAD, 212);
  ctx.textAlign = "left";

  // Party / site boxes
  let y = headerH + 40;
  const boxes = [doc.left, doc.right].filter((box): box is DocBox => Boolean(box));
  const boxW = boxes.length > 1 ? (W - PAD * 2 - 24) / 2 : W - PAD * 2;
  boxes.forEach((box, index) => {
    const x = PAD + index * (boxW + 24);
    ctx.fillStyle = SOFT;
    rounded(ctx, x, y, boxW, boxH, 20);
    ctx.fill();
    ctx.fillStyle = BLUE;
    ctx.font = font(700, 20);
    spacing(ctx, "3px");
    ctx.fillText(box.label.toUpperCase(), x + 28, y + 40);
    spacing(ctx, "0px");
    ctx.fillStyle = INK;
    ctx.font = font(700, 32);
    ctx.fillText(fit(ctx, box.main || "—", boxW - 56), x + 28, y + 84);
    if (box.sub) {
      ctx.fillStyle = MUTED;
      ctx.font = font(400, 24);
      ctx.fillText(fit(ctx, box.sub, boxW - 56), x + 28, y + 116);
    }
    if (box.accent) {
      ctx.fillStyle = BLUE;
      ctx.font = font(700, 24);
      ctx.fillText(fit(ctx, box.accent, boxW - 56), x + 28, y + 146);
    }
  });
  y += boxH + 40;

  // Table header
  ctx.fillStyle = INK;
  rounded(ctx, PAD, y, W - PAD * 2, 64, 14);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = font(700, 22);
  spacing(ctx, "2px");
  ctx.fillText("#", PAD + 24, y + 41);
  ctx.fillText(doc.columns === "amount" ? "DETAILS" : "ITEM", cols.item, y + 41);
  ctx.textAlign = "right";
  if (cols.qty) ctx.fillText("QTY", cols.qty, y + 41);
  if (cols.rate) ctx.fillText("RATE", cols.rate, y + 41);
  if (cols.amount) ctx.fillText("AMOUNT", cols.amount, y + 41);
  ctx.textAlign = "left";
  spacing(ctx, "0px");
  y += 64;

  // Rows
  doc.rows.forEach((row, index) => {
    const rowH = rowHeights[index];
    if (index % 2 === 1) {
      ctx.fillStyle = "#f5f7fc";
      ctx.fillRect(PAD, y, W - PAD * 2, rowH);
    }
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(PAD, y + rowH);
    ctx.lineTo(W - PAD, y + rowH);
    ctx.stroke();
    const base = y + rowH / 2 + 10;
    ctx.fillStyle = MUTED;
    ctx.font = font(400, 26);
    ctx.fillText(String(index + 1), PAD + 24, base);
    ctx.fillStyle = INK;
    ctx.font = font(600, 28);
    const lines = names[index];
    lines.forEach((text, i) => ctx.fillText(text, cols.item, base + (i - (lines.length - 1) / 2) * 34));
    ctx.textAlign = "right";
    if (cols.qty) {
      ctx.font = font(700, 28);
      ctx.fillText(row.qty ?? "", cols.qty, base);
    }
    if (cols.rate) {
      ctx.font = font(400, 26);
      ctx.fillStyle = MUTED;
      ctx.fillText(row.rate ? formatINR(row.rate) : "—", cols.rate, base);
    }
    if (cols.amount) {
      ctx.fillStyle = INK;
      ctx.font = font(600, 28);
      ctx.fillText(row.amount ? formatINR(row.amount) : "—", cols.amount, base);
    }
    ctx.textAlign = "left";
    y += rowH;
  });

  // Totals (right) and stamp (left)
  if (doc.totals.length) {
    y += 30;
    const top = y;
    const boxX = W - PAD - 460;
    ctx.fillStyle = SOFT;
    rounded(ctx, boxX, y, 460, totalsH - 30, 16);
    ctx.fill();
    for (const total of doc.totals) {
      const h = total.big ? 76 : 56;
      ctx.fillStyle = MUTED;
      ctx.font = font(700, total.big ? 22 : 20);
      spacing(ctx, "2px");
      ctx.fillText(total.label.toUpperCase(), boxX + 28, y + h / 2 + 8);
      spacing(ctx, "0px");
      ctx.textAlign = "right";
      ctx.fillStyle = TONES[total.tone ?? "ink"];
      ctx.font = total.big ? font(600, 38, SERIF) : font(700, 28);
      ctx.fillText(formatINR(total.value), W - PAD - 28, y + h / 2 + 12);
      ctx.textAlign = "left";
      y += h;
    }
    if (doc.stamp) {
      ctx.save();
      ctx.translate(PAD + 170, top + (totalsH - 30) / 2);
      ctx.rotate(-0.14);
      ctx.strokeStyle = doc.stamp.color;
      ctx.fillStyle = doc.stamp.color;
      ctx.lineWidth = 5;
      ctx.font = font(700, 40);
      spacing(ctx, "6px");
      const width = ctx.measureText(doc.stamp.text).width + 60;
      rounded(ctx, -width / 2, -40, width, 80, 14);
      ctx.stroke();
      ctx.textAlign = "center";
      ctx.fillText(doc.stamp.text, 0, 14);
      spacing(ctx, "0px");
      ctx.restore();
    }
  }

  // Note
  if (noteLines.length) {
    y += 50;
    ctx.fillStyle = MUTED;
    ctx.font = font(700, 20);
    spacing(ctx, "3px");
    ctx.fillText("NOTE", PAD, y);
    spacing(ctx, "0px");
    ctx.fillStyle = INK;
    ctx.font = font(400, 26);
    noteLines.forEach((text, index) => ctx.fillText(text, PAD, y + 40 + index * 36));
    y += 30 + noteLines.length * 36;
  }

  // Footer
  y += 60;
  doc.footer.forEach((text, index) => {
    ctx.fillStyle = index === 0 ? INK : MUTED;
    ctx.font = font(400, index === 0 ? 26 : 22);
    ctx.fillText(text, PAD, y + index * 40);
  });
  if (doc.signature) {
    const sy = y + Math.max(0, doc.footer.length - 1) * 40 + 70;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(W - PAD - 340, sy);
    ctx.lineTo(W - PAD, sy);
    ctx.stroke();
    ctx.textAlign = "right";
    ctx.fillStyle = INK;
    ctx.font = font(700, 24);
    ctx.fillText(fit(ctx, `For ${doc.business}`, 400), W - PAD, sy + 36);
    ctx.fillStyle = MUTED;
    ctx.font = font(400, 20);
    ctx.fillText("Authorised signatory", W - PAD, sy + 66);
    ctx.textAlign = "left";
  }

  ctx.fillStyle = BLUE;
  ctx.fillRect(0, H - 12, W, 12);
  return canvas.toDataURL("image/jpeg", 0.92);
}

export function itemRows(lines: OrderLine[], withRates: boolean): DocRow[] {
  return lines.map((line) => ({
    name: line.name,
    qty: formatQty(line.qty, line.unit),
    rate: withRates ? line.rate : undefined,
    amount: withRates ? lineTotal(line) : undefined,
  }));
}

export function linesSum(lines: OrderLine[]) {
  return round2(lines.reduce((sum, line) => sum + lineTotal(line), 0));
}
