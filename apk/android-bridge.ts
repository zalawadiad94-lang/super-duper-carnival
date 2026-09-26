/**
 * Glue between the web app and the native Android shell (MainActivity).
 *
 * WebView ignores `<a download>` clicks on blob: URLs, so the backup export
 * would silently do nothing. When the native `SitekhataAndroid` interface is
 * present, intercept those clicks, read the blob, and hand the text to Android,
 * which opens the system "Save to…" picker.
 */
type NativeBridge = {
  saveFile: (fileName: string, mimeType: string, contents: string) => void;
  pickContact?: () => void;
};

declare global {
  interface Window {
    SitekhataAndroid?: NativeBridge;
  }
}

export function installAndroidBridge() {
  const bridge = window.SitekhataAndroid;
  if (!bridge) return;

  const blobs = new Map<string, Blob>();
  const createObjectURL = URL.createObjectURL.bind(URL);
  URL.createObjectURL = (obj: Blob | MediaSource) => {
    const url = createObjectURL(obj);
    if (obj instanceof Blob) blobs.set(url, obj);
    return url;
  };
  const revokeObjectURL = URL.revokeObjectURL.bind(URL);
  URL.revokeObjectURL = (url: string) => {
    // Keep the blob until the save below has read it.
    setTimeout(() => {
      blobs.delete(url);
      revokeObjectURL(url);
    }, 60_000);
  };

  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    const blob = blobs.get(this.href);
    if (this.hasAttribute("download") && blob) {
      const name = this.getAttribute("download") || "download";
      void blob.text().then((text) => bridge.saveFile(name, blob.type || "application/octet-stream", text));
      return;
    }
    click.call(this);
  };
}

/**
 * PC app (Sitekhata.exe): links to WhatsApp, phone numbers and websites open
 * in the PC's own apps instead of inside the Sitekhata window.
 */
export function installDesktopLinks() {
  if (!window.__SITEKHATA_DESKTOP__) return;
  document.addEventListener(
    "click",
    (event) => {
      const link = (event.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link) return;
      const href = link.href;
      const external = /^(https?:|tel:|sms:|mailto:|whatsapp:)/i.test(href) && !href.startsWith(window.location.origin);
      if (!external) return;
      event.preventDefault();
      void fetch("/api/open", { method: "POST", body: JSON.stringify({ url: href }) });
    },
    true,
  );
}
