import { itemRows, linesSum, renderDocument, type OrderLine } from "@/lib/doc-image";
import { formatDay, todayISO } from "@/lib/format";

export type { OrderLine };

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

/** The purchase order as a JPEG data URL. */
export function renderPurchaseOrder(order: PurchaseOrder) {
  const [site, ...place] = order.deliverTo.split(",");
  return renderDocument({
    title: "Purchase order",
    business: order.business,
    refLabel: "PO No.",
    ref: order.reference,
    date: todayISO(),
    left: {
      label: "To (supplier)",
      main: order.supplier,
      sub: order.supplierPhone ? `Phone: ${order.supplierPhone}` : undefined,
    },
    right: {
      label: "Deliver to",
      main: site?.trim() || "—",
      sub: place.join(",").trim() || undefined,
      accent: order.neededBy ? `Needed by ${formatDay(order.neededBy)}` : undefined,
    },
    columns: order.showRates ? "full" : "qty",
    rows: itemRows(order.lines, order.showRates),
    totals: order.showRates ? [{ label: "Total", value: linesSum(order.lines), tone: "blue", big: true }] : [],
    note: order.note,
    footer: ["Please confirm this order and the delivery date.", "Thank you."],
    signature: true,
  });
}
