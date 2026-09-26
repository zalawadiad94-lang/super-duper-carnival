/** Phone number as digits with India's 91 prefix for 10-digit numbers. */
export function intlDigits(phone: string) {
  const digits = phone.replace(/\D/g, "").replace(/^0+/, "");
  return digits.length === 10 ? `91${digits}` : digits;
}

export function hasPhone(phone: string) {
  return intlDigits(phone).length >= 10;
}

/** WhatsApp chat with the text typed in; with no number WhatsApp asks whom to send it to. */
export function whatsAppLink(phone: string, text: string) {
  const num = hasPhone(phone) ? intlDigits(phone) : "";
  return `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
}

/** SMS app with the text typed in. */
export function smsLink(phone: string, text: string) {
  const num = hasPhone(phone) ? `+${intlDigits(phone)}` : "";
  return `sms:${num}?body=${encodeURIComponent(text)}`;
}

type NativeShare = {
  shareImage?: (base64: string, fileName: string, caption: string, phone: string, whatsapp: boolean) => void;
  saveBinary?: (fileName: string, mimeType: string, base64: string) => void;
};

function nativeShare(): NativeShare | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { SitekhataAndroid?: NativeShare }).SitekhataAndroid;
}

function dataUrlParts(dataUrl: string) {
  const [head, base64] = dataUrl.split(",", 2);
  const mime = /data:([^;]+)/.exec(head)?.[1] ?? "image/jpeg";
  return { mime, base64 };
}

function dataUrlToFile(dataUrl: string, fileName: string) {
  const { mime, base64 } = dataUrlParts(dataUrl);
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return new File([bytes], fileName, { type: mime });
}

/** Put the picture on the clipboard as PNG (what browsers can copy). */
async function copyImage(dataUrl: string) {
  try {
    const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!png) return false;
    await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
    return true;
  } catch {
    return false;
  }
}

function download(dataUrl: string, fileName: string) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = fileName;
  link.click();
}

/**
 * Share an image. In the Android app, `whatsapp` opens WhatsApp straight to
 * `phone`'s chat with the image attached (falling back to the share sheet);
 * otherwise the share sheet opens. In a browser: the Web Share sheet, or a
 * download where sharing files isn't supported. Returns how it was shared.
 */
export async function shareImage(
  dataUrl: string,
  fileName: string,
  caption: string,
  phone: string,
  whatsapp: boolean,
): Promise<"shared" | "downloaded" | "cancelled" | "copied"> {
  const native = nativeShare();
  if (typeof window !== "undefined" && window.__SITEKHATA_DESKTOP__) {
    // PC: copy the picture, then open the WhatsApp chat to paste it into.
    const copied = await copyImage(dataUrl);
    if (whatsapp) {
      const num = hasPhone(phone) ? intlDigits(phone) : "";
      await fetch("/api/open", { method: "POST", body: JSON.stringify({ url: `https://wa.me/${num}` }) }).catch(() => undefined);
    }
    if (copied) return "copied";
    download(dataUrl, fileName);
    return "downloaded";
  }
  if (native?.shareImage) {
    native.shareImage(dataUrlParts(dataUrl).base64, fileName, caption, hasPhone(phone) ? intlDigits(phone) : "", whatsapp);
    return "shared";
  }
  const file = dataUrlToFile(dataUrl, fileName);
  if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text: caption });
      return "shared";
    } catch {
      return "cancelled";
    }
  }
  download(dataUrl, fileName);
  return "downloaded";
}

/** Save an image to the phone (Android: the system "Save to…" picker). */
export function saveImage(dataUrl: string, fileName: string) {
  const native = nativeShare();
  if (native?.saveBinary) {
    const { mime, base64 } = dataUrlParts(dataUrl);
    native.saveBinary(fileName, mime, base64);
    return;
  }
  download(dataUrl, fileName);
}
