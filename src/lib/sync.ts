import { create } from "zustand";
import { applySyncDoc, getSyncDoc, useLedger } from "@/lib/store";
import { COLLECTIONS, mergeDocs, sameDoc, type SyncDoc } from "@/lib/sync-merge";

/**
 * Phone ↔ PC sync.
 *
 * The PC app (Sitekhata.exe) is the hub: it serves the app to its own window
 * and keeps the master copy of the books, reachable on the Wi-Fi at
 * http://<pc-ip>:47615. Every device (the PC window included) syncs the same
 * way: read the hub's copy, merge it with the local books, write the merge
 * back if it changed (with the revision it read, so two devices can't
 * overwrite each other), and keep the merge locally.
 */

export const HUB_PORT = 47615;

type HttpResult = { status: number; body: string };

type NativeHttp = {
  http?: (method: string, url: string, headers: string, body: string, callbackId: number) => void;
};

declare global {
  interface Window {
    __SITEKHATA_DESKTOP__?: boolean;
    __sitekhataHttp?: (id: number, status: number, body: string) => void;
  }
}

let seq = 0;
const pending = new Map<number, (result: HttpResult) => void>();

function nativeHttp() {
  if (typeof window === "undefined") return undefined;
  const bridge = (window as unknown as { SitekhataAndroid?: NativeHttp }).SitekhataAndroid;
  return typeof bridge?.http === "function" ? bridge : undefined;
}

/** HTTP that works from the Android app (through Java, so plain http on the Wi-Fi is allowed) and browsers. */
async function httpRequest(method: string, url: string, headers: Record<string, string>, body?: string): Promise<HttpResult> {
  const native = nativeHttp();
  if (native?.http) {
    window.__sitekhataHttp ??= (id, status, text) => {
      pending.get(id)?.({ status, body: text });
      pending.delete(id);
    };
    const id = ++seq;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        resolve({ status: 0, body: "" });
      }, 12000);
      pending.set(id, (result) => {
        clearTimeout(timer);
        resolve(result);
      });
      native.http!(method, url, JSON.stringify(headers), body ?? "", id);
    });
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, {
      method,
      headers: body ? { ...headers, "Content-Type": "application/json" } : headers,
      body,
      signal: controller.signal,
    });
    clearTimeout(timer);
    return { status: res.status, body: await res.text() };
  } catch {
    return { status: 0, body: "" };
  }
}

// ---------------------------------------------------------------------------
// Settings (per device, not part of the books)

export type SyncSettings = {
  /** PC address as typed, e.g. 192.168.1.5 (phone only). */
  address: string;
  key: string;
  pcName: string;
  deviceId: string;
  deviceName: string;
  lastSync: number | null;
};

const SETTINGS_KEY = "sitekhata-sync";

function loadSettings(): SyncSettings {
  let saved: Partial<SyncSettings> = {};
  try {
    saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") as Partial<SyncSettings>;
  } catch {
    // Private mode or bad JSON: start blank.
  }
  return {
    address: saved.address ?? "",
    key: saved.key ?? "",
    pcName: saved.pcName ?? "",
    deviceId: saved.deviceId ?? (typeof crypto !== "undefined" ? crypto.randomUUID() : String(Date.now())),
    deviceName: saved.deviceName ?? (isDesktop() ? "PC" : "Phone"),
    lastSync: saved.lastSync ?? null,
  };
}

function saveSettings(settings: SyncSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Not fatal: pairing just won't survive a restart.
  }
}

/** Running inside Sitekhata.exe on the PC? (the PC server marks its pages) */
export function isDesktop() {
  return typeof window !== "undefined" && window.__SITEKHATA_DESKTOP__ === true;
}

/** "192.168.1.5" → "http://192.168.1.5:47615" */
export function hubUrl(address: string) {
  let a = address.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  if (!a) return "";
  if (!/:\d+$/.test(a)) a = `${a}:${HUB_PORT}`;
  return `http://${a}`;
}

// ---------------------------------------------------------------------------
// Engine state

export type SyncStatus = "off" | "syncing" | "ok" | "offline" | "badkey" | "error";

type SyncState = {
  role: "hub" | "client" | "none";
  status: SyncStatus;
  message: string;
  settings: SyncSettings;
};

export const useSync = create<SyncState>(() => ({
  role: "none",
  status: "off",
  message: "",
  settings: typeof window === "undefined" ? ({} as SyncSettings) : loadSettings(),
}));

function base() {
  const { role, settings } = useSync.getState();
  return role === "hub" ? "" : hubUrl(settings.address);
}

function headers(key?: string): Record<string, string> {
  const { settings } = useSync.getState();
  return {
    "X-Sitekhata-Key": key ?? settings.key,
    "X-Sitekhata-Device": `${settings.deviceName}|${settings.deviceId}`,
  };
}

type Remote = { rev: number; doc: SyncDoc | null };

async function getRemote(url: string, key?: string): Promise<Remote | SyncStatus> {
  const res = await httpRequest("GET", `${url}/api/books`, headers(key));
  if (res.status === 0) return "offline";
  if (res.status === 401) return "badkey";
  if (res.status !== 200) return "error";
  try {
    return JSON.parse(res.body) as Remote;
  } catch {
    return "error";
  }
}

async function putRemote(url: string, baseRev: number, doc: SyncDoc): Promise<{ rev: number } | "conflict" | SyncStatus> {
  const res = await httpRequest("PUT", `${url}/api/books`, headers(), JSON.stringify({ baseRev, doc }));
  if (res.status === 0) return "offline";
  if (res.status === 401) return "badkey";
  if (res.status === 409) return "conflict";
  if (res.status !== 200) return "error";
  return JSON.parse(res.body) as { rev: number };
}

let running = false;
let again = false;

/** One sync round with the PC. Safe to call any time; overlapping calls are queued. */
export async function syncNow(): Promise<void> {
  const { role } = useSync.getState();
  if (role === "none") return;
  if (running) {
    again = true;
    return;
  }
  running = true;
  useSync.setState({ status: "syncing" });
  try {
    const url = base();
    let result: SyncStatus = "error";
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const remote = await getRemote(url);
      if (typeof remote === "string") {
        result = remote;
        break;
      }
      if (untouchedSample()) {
        // Sample books nobody edited never go to the PC; real books replace them.
        if (remote.doc && hasBooks(remote.doc)) applySyncDoc(remote.doc);
        result = "ok";
        break;
      }
      const merged = remote.doc ? mergeDocs(getSyncDoc(), remote.doc) : getSyncDoc();
      if (!remote.doc || !sameDoc(merged, remote.doc)) {
        const put = await putRemote(url, remote.rev, merged);
        if (put === "conflict") continue;
        if (typeof put === "string") {
          result = put;
          break;
        }
      }
      // Keep edits made on this device while the request was out.
      const latest = mergeDocs(getSyncDoc(), merged);
      if (!sameDoc(latest, getSyncDoc())) applySyncDoc(latest);
      if (!sameDoc(latest, merged)) again = true;
      result = "ok";
      break;
    }
    const settings = { ...useSync.getState().settings };
    if (result === "ok") settings.lastSync = Date.now();
    saveSettings(settings);
    useSync.setState({
      status: result,
      settings,
      message:
        result === "offline"
          ? "Can't reach the PC. Is Sitekhata open on the PC, on the same Wi-Fi?"
          : result === "badkey"
            ? "The PC refused the pairing code. Connect again with the code shown on the PC."
            : result === "error"
              ? "Sync failed. It will try again."
              : "",
    });
  } finally {
    running = false;
    if (again) {
      again = false;
      setTimeout(() => void syncNow(), 300);
    }
  }
}

let started = false;

/** Start syncing (once, after the saved books have loaded). */
export function startSync() {
  if (started || typeof window === "undefined") return;
  started = true;
  const settings = loadSettings();
  const role = isDesktop() ? "hub" : settings.address ? "client" : "none";
  useSync.setState({ role, settings, status: role === "none" ? "off" : "syncing" });
  saveSettings(settings);

  let timer: ReturnType<typeof setTimeout> | undefined;
  useLedger.subscribe((state, prev) => {
    if (state.syncMeta === prev.syncMeta) return;
    clearTimeout(timer);
    timer = setTimeout(() => void syncNow(), 1200);
  });
  setInterval(() => void syncNow(), 10000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void syncNow();
  });
  window.addEventListener("focus", () => void syncNow());
  void syncNow();
}

/** The sample books, still showing and never edited. */
function untouchedSample() {
  const state = useLedger.getState();
  return state.showSampleHint && COLLECTIONS.every((coll) => Object.keys(state.syncMeta.updated[coll] ?? {}).length === 0);
}

function hasBooks(doc: SyncDoc | null) {
  return Boolean(doc && COLLECTIONS.some((coll) => doc.data[coll].length > 0));
}

export type PairCheck =
  | { ok: false; message: string }
  | { ok: true; pcName: string; pcHasBooks: boolean; phoneHasBooks: boolean };

/** Check an address + code before connecting. */
export async function checkPc(address: string, key: string): Promise<PairCheck> {
  const url = hubUrl(address);
  if (!url) return { ok: false, message: "Type the PC address shown in Sitekhata on the PC." };
  const hello = await httpRequest("GET", `${url}/api/hello`, {});
  if (hello.status === 0) {
    return { ok: false, message: "Can't reach the PC. Open Sitekhata on the PC and check both are on the same Wi-Fi." };
  }
  let pcName = "PC";
  try {
    const info = JSON.parse(hello.body) as { app?: string; name?: string };
    if (info.app !== "sitekhata") throw new Error();
    pcName = info.name || "PC";
  } catch {
    return { ok: false, message: "That address is not Sitekhata on a PC." };
  }
  const remote = await getRemote(url, key.trim());
  if (remote === "badkey") return { ok: false, message: "Wrong pairing code. Check the code on the PC." };
  if (typeof remote === "string") return { ok: false, message: "The PC didn't answer properly. Try again." };
  const state = useLedger.getState();
  const phoneHasBooks = !state.showSampleHint && hasBooks(getSyncDoc());
  return { ok: true, pcName, pcHasBooks: hasBooks(remote.doc), phoneHasBooks };
}

/**
 * Pair with the PC. "pc": replace this device's books with the PC's.
 * "combine": merge both (nothing is lost).
 */
export async function connectPc(address: string, key: string, pcName: string, how: "pc" | "combine") {
  const settings: SyncSettings = { ...useSync.getState().settings, address: address.trim(), key: key.trim(), pcName };
  saveSettings(settings);
  useSync.setState({ role: "client", settings });
  if (how === "pc") {
    const remote = await getRemote(hubUrl(settings.address));
    if (typeof remote !== "string" && remote.doc) applySyncDoc(remote.doc);
  }
  await syncNow();
}

export function disconnectPc() {
  const settings: SyncSettings = { ...useSync.getState().settings, address: "", key: "", pcName: "", lastSync: null };
  saveSettings(settings);
  useSync.setState({ role: "none", status: "off", message: "", settings });
}

/** PC only: pairing details and the devices that synced. */
export type HubInfo = {
  key: string;
  name: string;
  port: number;
  addresses: string[];
  devices: { name: string; ip: string; lastSeen: number }[];
};

export async function hubInfo(): Promise<HubInfo | null> {
  const res = await httpRequest("GET", "/api/pairing", {});
  if (res.status !== 200) return null;
  return JSON.parse(res.body) as HubInfo;
}

/** PC only: open a link (WhatsApp, phone…) in the PC's default app. */
export async function openOnPc(url: string) {
  await httpRequest("POST", "/api/open", {}, JSON.stringify({ url }));
}
