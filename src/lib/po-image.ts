import { formatQty, lineTotal, round2, type BillLine } from "@/lib/bills";
import { formatDay, formatINR, todayISO } from "@/lib/format";

export type OrderLine = Pick<BillLine, "name" | "unit" | "qty" | "rate">;

export type PurchaseOrder = {
  business: string;
  supplier: string;
  supplierPhone: string;
  reference: string;
  lines: OrderLine[];
  showRates: boolean;
  deliverTo: string;
  neededBy: string;
  note: string;
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

/** Draw the purchase order and return it as a JPEG data URL. */
export async function renderPurchaseOrder(order: PurchaseOrder): Promise<string> {
  try {
    await Promise.all([
      document.fonts.load(font(600, 40, SERIF)),
      document.fonts.load(font(400, 28)),
      document.fonts.load(font(700, 28)),
    ]);
  } catch {
    // Fall back to system fonts.
  }

  const canvas = document.createElement("canvas");
  const measure = canvas.getContext("2d")!;
  measure.font = font(400, 26);
  const noteLines = order.note ? wrap(measure, order.note, W - PAD * 2 - 40) : [];

  const cols = order.showRates
    ? { no: PAD + 24, item: PAD + 84, qty: W - PAD - 400, rate: W - PAD - 200, amount: W - PAD - 24 }
    : { no: PAD + 24, item: PAD + 84, qty: W - PAD - 24, rate: 0, amount: 0 };
  const itemMax = cols.qty - 190 - cols.item;
  measure.font = font(600, 28);
  const itemLines = order.lines.map((line) => {
    const wrapped = wrap(measure, line.name, itemMax);
    return wrapped.length > 2 ? [wrapped[0], fit(measure, wrapped.slice(1).join(" "), itemMax)] : wrapped;
  });
  const rowHeights = itemLines.map((lines) => (lines.length > 1 ? 104 : 76));
  const headerH = 250;
  const infoH = 210;
  const tableH = 64 + rowHeights.reduce((sum, h) => sum + h, 0) + (order.showRates ? 90 : 0);
  const noteH = noteLines.length ? 70 + noteLines.length * 36 : 0;
  const footerH = 260;
  const H = headerH + infoH + tableH + noteH + footerH;

  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.textBaseline = "alphabetic";

  // Page
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
  ctx.fillText("PURCHASE ORDER", PAD, 84);
  spacing(ctx, "0px");

  ctx.fillStyle = "#ffffff";
  ctx.font = font(600, 56, SERIF);
  ctx.fillText(fit(ctx, order.business, W - PAD * 2 - 330), PAD, 158);

  ctx.textAlign = "right";
  ctx.font = font(400, 24);
  ctx.fillStyle = "#c9d6ff";
  ctx.fillText("PO No.", W - PAD, 84);
  ctx.fillText("Date", W - PAD, 172);
  ctx.fillStyle = "#ffffff";
  ctx.font = font(700, 32);
  ctx.fillText(order.reference || "—", W - PAD, 124);
  ctx.fillText(formatDay(todayISO()), W - PAD, 212);
  ctx.textAlign = "left";

  // Info boxes
  let y = headerH + 40;
  const colW = (W - PAD * 2 - 24) / 2;
  const box = (x: number, label: string, main: string, sub: string, sub2 = "") => {
    ctx.fillStyle = SOFT;
    rounded(ctx, x, y, colW, 160, 20);
    ctx.fill();
    ctx.fillStyle = BLUE;
    ctx.font = font(700, 20);
    spacing(ctx, "3px");
    ctx.fillText(label, x + 28, y + 40);
    spacing(ctx, "0px");
    ctx.fillStyle = INK;
    ctx.font = font(700, 32);
    ctx.fillText(fit(ctx, main || "—", colW - 56), x + 28, y + 84);
    ctx.fillStyle = MUTED;
    ctx.font = font(400, 24);
    ctx.fillText(fit(ctx, sub, colW - 56), x + 28, y + 116);
    if (sub2) {
      ctx.fillStyle = BLUE;
      ctx.font = font(700, 24);
      ctx.fillText(fit(ctx, sub2, colW - 56), x + 28, y + 146);
    }
  };
  box(PAD, "TO (SUPPLIER)", order.supplier, order.supplierPhone ? `Phone: ${order.supplierPhone}` : "");
  box(
    PAD + colW + 24,
    "DELIVER TO",
    order.deliverTo.split(",")[0] ?? "",
    order.deliverTo.split(",").slice(1).join(",").trim(),
    order.neededBy ? `Needed by ${formatDay(order.neededBy)}` : "",
  );
  y += infoH - 20;

  // Table
  ctx.fillStyle = INK;
  rounded(ctx, PAD, y, W - PAD * 2, 64, 14);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = font(700, 22);
  spacing(ctx, "2px");
  ctx.fillText("#", cols.no, y + 41);
  ctx.fillText("ITEM", cols.item, y + 41);
  ctx.textAlign = "right";
  ctx.fillText("QTY", cols.qty, y + 41);
  if (order.showRates) {
    ctx.fillText("RATE", cols.rate, y + 41);
    ctx.fillText("AMOUNT", cols.amount, y + 41);
  }
  ctx.textAlign = "left";
  spacing(ctx, "0px");
  y += 64;

  order.lines.forEach((line, index) => {
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
    ctx.fillText(String(index + 1), cols.no, base);
    ctx.fillStyle = INK;
    ctx.font = font(600, 28);
    const names = itemLines[index];
    names.forEach((text, i) => ctx.fillText(text, cols.item, base + (i - (names.length - 1) / 2) * 34));
    ctx.textAlign = "right";
    ctx.font = font(700, 28);
    ctx.fillText(formatQty(line.qty, line.unit), cols.qty, base);
    if (order.showRates) {
      ctx.font = font(400, 26);
      ctx.fillStyle = MUTED;
      ctx.fillText(line.rate > 0 ? formatINR(line.rate) : "—", cols.rate, base);
      ctx.fillStyle = INK;
      ctx.font = font(600, 28);
      ctx.fillText(line.rate > 0 ? formatINR(lineTotal(line)) : "—", cols.amount, base);
    }
    ctx.textAlign = "left";
    y += rowH;
  });

  if (order.showRates) {
    const total = round2(order.lines.reduce((sum, line) => sum + lineTotal(line), 0));
    y += 20;
    ctx.fillStyle = SOFT;
    rounded(ctx, W - PAD - 440, y, 440, 70, 14);
    ctx.fill();
    ctx.fillStyle = MUTED;
    ctx.font = font(700, 22);
    ctx.fillText("TOTAL", W - PAD - 412, y + 44);
    ctx.textAlign = "right";
    ctx.fillStyle = BLUE;
    ctx.font = font(600, 36, SERIF);
    ctx.fillText(formatINR(total), W - PAD - 28, y + 48);
    ctx.textAlign = "left";
    y += 70;
  }

  // Note
  if (noteLines.length) {
    y += 40;
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
  y = H - footerH + 50;
  ctx.fillStyle = INK;
  ctx.font = font(400, 26);
  ctx.fillText("Please confirm this order and the delivery date.", PAD, y + 20);
  ctx.fillStyle = MUTED;
  ctx.font = font(400, 22);
  ctx.fillText("Thank you.", PAD, y + 58);

  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(W - PAD - 340, y + 110);
  ctx.lineTo(W - PAD, y + 110);
  ctx.stroke();
  ctx.textAlign = "right";
  ctx.fillStyle = INK;
  ctx.font = font(700, 24);
  ctx.fillText(fit(ctx, `For ${order.business}`, 400), W - PAD, y + 146);
  ctx.fillStyle = MUTED;
  ctx.font = font(400, 20);
  ctx.fillText("Authorised signatory", W - PAD, y + 176);
  ctx.textAlign = "left";

  ctx.fillStyle = BLUE;
  ctx.fillRect(0, H - 12, W, 12);

  return canvas.toDataURL("image/jpeg", 0.92);
}
