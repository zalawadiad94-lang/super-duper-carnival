import { useState } from "react";
import { Download, ImageIcon, MessageCircle, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui";
import { hasPhone, saveImage, shareImage } from "@/lib/share";

/**
 * Preview of a JPG document with Send on WhatsApp (straight to `phone`'s chat,
 * image only), Share (any app) and Save.
 */
export function ImageSendPanel({
  image,
  fileName,
  phone,
  onBeforeSend,
}: {
  image: string | null;
  fileName: string;
  phone: string;
  onBeforeSend?: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function send(whatsapp: boolean) {
    if (!image || busy) return;
    setBusy(true);
    onBeforeSend?.();
    try {
      const how = await shareImage(image, fileName, "", phone, whatsapp);
      if (how === "downloaded") toast.success("Saved as JPG — attach it in WhatsApp");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-2xl border border-line bg-bg p-2">
        {image ? (
          <img src={image} alt="Document preview" className="w-full rounded-xl shadow-sm" />
        ) : (
          <div className="flex h-40 items-center justify-center gap-2 text-sm text-muted">
            <ImageIcon className="size-4" aria-hidden="true" />
            Making the JPG…
          </div>
        )}
      </div>
      <Button className="h-14 w-full bg-get text-base" disabled={!image || busy} onClick={() => void send(true)}>
        <MessageCircle className="size-5" aria-hidden="true" />
        Send JPG on WhatsApp
      </Button>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="soft" disabled={!image || busy} onClick={() => void send(false)}>
          <Share2 className="size-4" aria-hidden="true" />
          Share image
        </Button>
        <Button variant="soft" disabled={!image} onClick={() => image && saveImage(image, fileName)}>
          <Download className="size-4" aria-hidden="true" />
          Save JPG
        </Button>
      </div>
      <p className="text-xs text-muted">
        {hasPhone(phone)
          ? "WhatsApp opens their chat with the picture attached — tap send."
          : "No number saved — WhatsApp will ask which chat to send it to."}
      </p>
    </div>
  );
}
