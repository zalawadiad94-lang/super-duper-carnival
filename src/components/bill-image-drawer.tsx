import { useEffect, useState } from "react";
import { DrawerFrame } from "@/components/drawers";
import { ImageSendPanel } from "@/components/image-send";
import { Button } from "@/components/ui";
import { renderBill } from "@/lib/bill-image";
import { billLabel, type Bill } from "@/lib/bills";
import { useLedger } from "@/lib/store";

const TITLE = { sale: "Send invoice", purchase: "Send purchase bill", expense: "Send expense voucher" } as const;

/** The bill as a JPG (invoice / purchase bill / expense voucher), ready to send. */
export function BillImageDrawer({ bill, open, onOpenChange }: { bill: Bill; open: boolean; onOpenChange: (open: boolean) => void }) {
  const businessName = useLedger((state) => state.businessName);
  const parties = useLedger((state) => state.parties);
  const sites = useLedger((state) => state.sites);
  const party = bill.partyId ? parties.find((item) => item.id === bill.partyId) : undefined;
  const site = bill.siteId ? sites.find((item) => item.id === bill.siteId) : undefined;
  const [image, setImage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setImage(null);
    void renderBill(bill, businessName, party, site).then((url) => {
      if (!cancelled) setImage(url);
    });
    return () => {
      cancelled = true;
    };
  }, [open, bill, businessName, party, site]);

  const fileName = `${billLabel(bill).replace(/[^A-Za-z0-9]+/g, "-")}-${bill.date}.jpg`;

  return (
    <DrawerFrame
      open={open}
      onOpenChange={onOpenChange}
      title={TITLE[bill.type]}
      lede={party?.phone ? `To ${party.name} on WhatsApp, as a picture.` : "As a picture (JPG)."}
    >
      {open ? <ImageSendPanel image={image} fileName={fileName} phone={party?.phone ?? ""} /> : null}
      <Button variant="ghost" className="mt-2 w-full" onClick={() => onOpenChange(false)}>
        Done
      </Button>
    </DrawerFrame>
  );
}
