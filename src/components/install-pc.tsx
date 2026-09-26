import { useEffect, useState } from "react";
import { Download } from "lucide-react";

export function InstallPcBar() {
  const [url, setUrl] = useState("/Sitekhata.apk");
  const [note, setNote] = useState("");

  useEffect(() => {
    setUrl(`${window.location.origin}/Sitekhata.apk`);
  }, []);

  return (
    <div className="border-b border-brass bg-brass px-4 py-4 text-bg lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-display text-2xl leading-none">Phone app, not Chrome</p>
          <p className="mt-1 max-w-xl text-sm text-bg/90">
            This window is only the preview. Install Sitekhata.apk on the phone. The Sitekhata icon opens the app by itself.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={url}
            className="inline-flex h-12 items-center gap-2 rounded-xl bg-bg px-5 text-base font-bold text-ink"
          >
            <Download className="h-5 w-5" />
            Download Sitekhata.apk
          </a>
          <button
            type="button"
            className="inline-flex h-12 items-center rounded-xl border border-bg/40 px-4 text-sm font-bold"
            onClick={() => {
              void navigator.clipboard.writeText(url).then(
                () => setNote("Link copied. Paste it into a new tab’s address bar, then send the file to your phone."),
                () => setNote(url),
              );
            }}
          >
            Copy link
          </button>
        </div>
      </div>
      <p className="mt-3 break-all font-mono text-xs text-bg/90">{note || url}</p>
    </div>
  );
}
