import { useEffect, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, ChevronLeft, Laptop, Loader2, RefreshCw, Smartphone, Unplug, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { Button, Field, PageIntro, TextInput } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  checkPc,
  connectPc,
  disconnectPc,
  hubInfo,
  isDesktop,
  syncNow,
  useSync,
  type HubInfo,
  type SyncStatus,
} from "@/lib/sync";

export const Route = createFileRoute("/connect")({ component: ConnectPage });

function ago(time: number | null) {
  if (!time) return "never";
  const seconds = Math.round((Date.now() - time) / 1000);
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds} sec ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return new Date(time).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

const STATUS_TEXT: Record<SyncStatus, string> = {
  off: "Not connected",
  syncing: "Syncing…",
  ok: "Up to date",
  offline: "PC not reachable",
  badkey: "Pairing code refused",
  error: "Sync problem",
};

function StatusCard() {
  const { status, message, settings, role } = useSync();
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 5000);
    return () => clearInterval(timer);
  }, []);
  const good = status === "ok" || status === "syncing";
  return (
    <div className={cn("rounded-2xl border p-4", good ? "border-get/30 bg-get-soft" : "border-give/30 bg-give-soft")}>
      <div className="flex items-center gap-3">
        {status === "syncing" ? (
          <Loader2 className="size-6 animate-spin text-brass" aria-hidden="true" />
        ) : good ? (
          <CheckCircle2 className="size-6 text-get" aria-hidden="true" />
        ) : (
          <WifiOff className="size-6 text-give" aria-hidden="true" />
        )}
        <div className="min-w-0">
          <p className="font-semibold">{STATUS_TEXT[status]}</p>
          <p className="text-xs text-muted">
            {role === "client" ? `With ${settings.pcName || "your PC"} (${settings.address}) · ` : ""}
            Last sync {ago(settings.lastSync)}
          </p>
        </div>
      </div>
      {message ? <p className="mt-2 text-sm text-give">{message}</p> : null}
    </div>
  );
}

/** On the PC: show what to type on the phone, and who has synced. */
function HubView() {
  const [info, setInfo] = useState<HubInfo | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      void hubInfo().then((next) => {
        if (alive) setInfo(next ? { ...next, addresses: next.addresses ?? [], devices: next.devices ?? [] } : null);
      });
    load();
    const timer = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <StatusCard />
      <div className="rounded-2xl bg-header p-5 text-bg">
        <p className="text-xs font-semibold uppercase tracking-wide text-bg/70">On your phone, type</p>
        <p className="mt-3 text-xs text-bg/70">PC address</p>
        {info?.addresses.length ? (
          info.addresses.map((address) => (
            <p key={address} className="font-display text-3xl tracking-tight">
              {address}
            </p>
          ))
        ) : (
          <p className="text-sm">No Wi-Fi found on this PC. Connect the PC to Wi-Fi or your phone's hotspot.</p>
        )}
        <p className="mt-3 text-xs text-bg/70">Pairing code</p>
        <p className="font-display text-4xl tracking-[0.3em]">{info?.key ?? "······"}</p>
      </div>
      <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
        <li>Keep this PC and the phone on the same Wi-Fi (or the phone's hotspot).</li>
        <li>On the phone: Sitekhata → tap your firm name → Phone &amp; PC sync.</li>
        <li>Type the address and code above, then Connect.</li>
        <li>If Windows asks about network access, choose Allow.</li>
      </ol>
      <div>
        <h2 className="font-display text-xl">Devices</h2>
        <div className="mt-2 overflow-hidden rounded-2xl border border-line bg-surface">
          {info?.devices.length ? (
            info.devices.map((device) => (
              <div key={`${device.name}-${device.ip}`} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0">
                {device.name === "PC" ? <Laptop className="size-5 text-brass" /> : <Smartphone className="size-5 text-brass" />}
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{device.ip === "127.0.0.1" ? "This PC" : device.name}</span>
                  <span className="text-xs text-muted">{device.ip === "127.0.0.1" ? "Sitekhata window" : device.ip}</span>
                </span>
                <span className="text-xs text-muted">{ago(device.lastSeen)}</span>
              </div>
            ))
          ) : (
            <p className="px-4 py-3 text-sm text-muted">No phone has synced yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

/** On the phone: connect to the PC. */
function ClientView() {
  const { role, settings } = useSync();
  const [address, setAddress] = useState(settings.address);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [choice, setChoice] = useState<{ pcName: string } | null>(null);

  async function onConnect(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const check = await checkPc(address, key);
      if (!check.ok) return setError(check.message);
      if (check.pcHasBooks && check.phoneHasBooks) {
        setChoice({ pcName: check.pcName });
        return;
      }
      await connectPc(address, key, check.pcName, check.pcHasBooks ? "pc" : "combine");
      toast.success(`Connected to ${check.pcName}`);
    } finally {
      setBusy(false);
    }
  }

  async function choose(how: "pc" | "combine") {
    if (!choice) return;
    setBusy(true);
    try {
      await connectPc(address, key, choice.pcName, how);
      toast.success(`Connected to ${choice.pcName}`);
      setChoice(null);
    } finally {
      setBusy(false);
    }
  }

  if (role === "client") {
    return (
      <div className="flex flex-col gap-4">
        <StatusCard />
        <Button onClick={() => void syncNow()}>
          <RefreshCw className="size-4" aria-hidden="true" />
          Sync now
        </Button>
        <p className="text-sm text-muted">
          Changes on this phone and on the PC are synced automatically whenever both are on the same Wi-Fi and
          Sitekhata is open on the PC. Away from it, keep working — it catches up next time.
        </p>
        <Button
          variant="ghost"
          className="border border-line"
          onClick={() => {
            disconnectPc();
            toast.success("Disconnected. Your books stay on this phone.");
          }}
        >
          <Unplug className="size-4" aria-hidden="true" />
          Disconnect from PC
        </Button>
      </div>
    );
  }

  if (choice) {
    return (
      <div className="flex flex-col gap-3">
        <p className="font-semibold">Both this phone and {choice.pcName} already have books.</p>
        <button
          type="button"
          disabled={busy}
          onClick={() => void choose("pc")}
          className="rounded-2xl border-2 border-brass bg-brass-soft p-4 text-left"
        >
          <span className="block font-semibold text-brass">Use the PC's books on this phone</span>
          <span className="text-sm text-muted">This phone's books are replaced by the PC's. Best if you started on the PC.</span>
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void choose("combine")}
          className="rounded-2xl border border-line bg-surface p-4 text-left"
        >
          <span className="block font-semibold">Combine both</span>
          <span className="text-sm text-muted">Everything from the phone and the PC is kept, on both.</span>
        </button>
        <Button variant="ghost" onClick={() => setChoice(null)}>
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={(event) => void onConnect(event)} className="flex flex-col gap-4">
      <div className="rounded-2xl border border-line bg-surface p-4 text-sm text-muted">
        <p className="font-semibold text-ink">First, on the PC</p>
        Open Sitekhata on the PC → firm name → Phone &amp; PC sync. It shows the PC address and a pairing code.
      </div>
      <Field label="PC address">
        <TextInput
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          placeholder="192.168.1.5"
          inputMode="decimal"
          autoCapitalize="off"
          autoCorrect="off"
        />
      </Field>
      <Field label="Pairing code">
        <TextInput
          value={key}
          onChange={(event) => setKey(event.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="6 digits"
          inputMode="numeric"
        />
      </Field>
      {error ? <p className="text-sm text-give">{error}</p> : null}
      <Button type="submit" disabled={busy || !address.trim() || key.length < 6} className="w-full">
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
        Connect
      </Button>
    </form>
  );
}

function ConnectPage() {
  const desktop = isDesktop();
  return (
    <div className="mx-auto max-w-xl pb-16">
      <Link to="/" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-muted">
        <ChevronLeft className="size-4" aria-hidden="true" />
        Home
      </Link>
      <PageIntro
        title="Phone & PC sync"
        lede={
          desktop
            ? "This PC keeps the master copy of your books. Connect your phone to it."
            : "Keep this phone and Sitekhata on your PC in step."
        }
      />
      {desktop ? <HubView /> : <ClientView />}
    </div>
  );
}
