import { daysAgo } from "@/lib/format";

export const PARTY_ROLES = ["client", "supplier", "labour", "subcontractor"] as const;
export type PartyRole = (typeof PARTY_ROLES)[number];

export const SITE_STATUSES = ["active", "completed"] as const;
export type SiteStatus = (typeof SITE_STATUSES)[number];

export const ENTRY_KINDS = [
  "bill",
  "receipt",
  "purchase",
  "supplier_paid",
  "wages_due",
  "wages_paid",
  "advance",
  "sub_bill",
  "sub_paid",
  "gave",
  "got",
] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];
export type Direction = "gave" | "got";

export type Party = {
  id: string;
  name: string;
  phone: string;
  role: PartyRole;
  note: string;
  createdAt: string;
};

export type Site = {
  id: string;
  name: string;
  location: string;
  status: SiteStatus;
  clientPartyId: string | null;
  createdAt: string;
};

export type Entry = {
  id: string;
  partyId: string;
  siteId: string | null;
  kind: EntryKind;
  amount: number;
  date: string;
  note: string;
  createdAt: string;
};

export type KindMeta = {
  label: string;
  direction: Direction;
  cash: boolean;
  hint: string;
};

export const KIND_META: Record<EntryKind, KindMeta> = {
  bill: {
    label: "Bill raised",
    direction: "gave",
    cash: false,
    hint: "Work billed. They owe you.",
  },
  receipt: {
    label: "Payment in",
    direction: "got",
    cash: true,
    hint: "Cash or NEFT received.",
  },
  purchase: {
    label: "Material on credit",
    direction: "got",
    cash: false,
    hint: "Goods taken. You owe them.",
  },
  supplier_paid: {
    label: "Paid supplier",
    direction: "gave",
    cash: true,
    hint: "Cash paid to supplier.",
  },
  wages_due: {
    label: "Wages due",
    direction: "got",
    cash: false,
    hint: "Work done. Wages not paid yet.",
  },
  wages_paid: {
    label: "Wages paid",
    direction: "gave",
    cash: true,
    hint: "Cash paid to labour.",
  },
  advance: {
    label: "Advance given",
    direction: "gave",
    cash: true,
    hint: "Cash given before the bill.",
  },
  sub_bill: {
    label: "Their bill",
    direction: "got",
    cash: false,
    hint: "Subcontractor invoice.",
  },
  sub_paid: {
    label: "Paid subcontractor",
    direction: "gave",
    cash: true,
    hint: "Cash paid to subcontractor.",
  },
  gave: {
    label: "You gave",
    direction: "gave",
    cash: true,
    hint: "Any other amount you gave.",
  },
  got: {
    label: "You got",
    direction: "got",
    cash: true,
    hint: "Any other amount you got.",
  },
};

export const ROLE_META: Record<PartyRole, { label: string; hint: string }> = {
  client: { label: "Client", hint: "Pays you for the work" },
  supplier: { label: "Supplier", hint: "Cement, steel, sand, hardware" },
  labour: { label: "Labour", hint: "Mistry, mazdoor, gang" },
  subcontractor: { label: "Subcontractor", hint: "Plumbing, electrical, JCB" },
};

const KINDS_FOR_ROLE: Record<PartyRole, EntryKind[]> = {
  client: ["bill", "receipt", "gave", "got"],
  supplier: ["purchase", "supplier_paid", "advance", "gave", "got"],
  labour: ["wages_due", "wages_paid", "advance", "gave", "got"],
  subcontractor: ["sub_bill", "sub_paid", "advance", "gave", "got"],
};

export function kindsForRole(role: PartyRole) {
  return KINDS_FOR_ROLE[role];
}

export function directionOf(kind: EntryKind) {
  return KIND_META[kind].direction;
}

export type PartyBalance = { gave: number; got: number; net: number };

export function partyBalance(entries: Entry[], partyId: string): PartyBalance {
  let gave = 0;
  let got = 0;
  for (const entry of entries) {
    if (entry.partyId !== partyId) continue;
    if (directionOf(entry.kind) === "gave") gave += entry.amount;
    else got += entry.amount;
  }
  return { gave, got, net: gave - got };
}

export type BalanceTone = "get" | "give" | "settled";

export function balanceLabel(net: number): { title: string; tone: BalanceTone; amount: number } {
  if (net > 0.001) return { title: "You'll get", tone: "get", amount: net };
  if (net < -0.001) return { title: "You'll give", tone: "give", amount: -net };
  return { title: "Settled", tone: "settled", amount: 0 };
}

export function bookTotals(parties: Party[], entries: Entry[]) {
  let get = 0;
  let give = 0;
  for (const party of parties) {
    const { net } = partyBalance(entries, party.id);
    if (net > 0) get += net;
    else if (net < 0) give += -net;
  }
  return { get, give, net: get - give };
}

export function sortEntriesDesc(entries: Entry[]) {
  return [...entries].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
    return a.id < b.id ? 1 : -1;
  });
}

export function runningNets(entries: Entry[]) {
  const asc = [...entries].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
    return a.id < b.id ? -1 : 1;
  });
  const nets = new Map<string, number>();
  let net = 0;
  for (const entry of asc) {
    net += directionOf(entry.kind) === "gave" ? entry.amount : -entry.amount;
    nets.set(entry.id, net);
  }
  return nets;
}

export function cashInRange(entries: Entry[], month: string | null) {
  let cashIn = 0;
  let cashOut = 0;
  for (const entry of entries) {
    if (month && !entry.date.startsWith(month)) continue;
    const meta = KIND_META[entry.kind];
    if (!meta.cash) continue;
    if (meta.direction === "got") cashIn += entry.amount;
    else cashOut += entry.amount;
  }
  return { cashIn, cashOut, net: cashIn - cashOut };
}

export type Books = {
  businessName: string;
  parties: Party[];
  sites: Site[];
  entries: Entry[];
  showSampleHint: boolean;
};

function entry(
  id: string,
  partyId: string,
  siteId: string | null,
  kind: EntryKind,
  amount: number,
  days: number,
  note: string,
): Entry {
  const date = daysAgo(days);
  return {
    id,
    partyId,
    siteId,
    kind,
    amount,
    date,
    note,
    createdAt: `${date}T08:00:00.000Z`,
  };
}

export function sampleBooks(): Books {
  const parties: Party[] = [
    { id: "p-mehta", name: "Mehta Developers", phone: "9810011122", role: "client", note: "Block B, RA bills monthly", createdAt: daysAgo(80) },
    { id: "p-pwd", name: "PWD Rewari", phone: "9871002200", role: "client", note: "Site engineer Sandeep", createdAt: daysAgo(60) },
    { id: "p-sharma", name: "R.K. Sharma", phone: "9810099330", role: "client", note: "Farmhouse, closed", createdAt: daysAgo(90) },
    { id: "p-bharat", name: "Bharat Cement & Steel", phone: "9811122334", role: "supplier", note: "UltraTech + TMT", createdAt: daysAgo(70) },
    { id: "p-yamuna", name: "Yamuna Sand Suppliers", phone: "9899112233", role: "supplier", note: "Coarse sand, trolley", createdAt: daysAgo(50) },
    { id: "p-om", name: "Om Electricals", phone: "9811776655", role: "supplier", note: "Conduit and DB", createdAt: daysAgo(30) },
    { id: "p-raju", name: "Raju Mistry gang", phone: "9891002211", role: "labour", note: "6 masons, weekly", createdAt: daysAgo(70) },
    { id: "p-suresh", name: "Suresh Bar-bender", phone: "9812003344", role: "labour", note: "Adjust advance in wages", createdAt: daysAgo(40) },
    { id: "p-imran", name: "Imran Painter", phone: "9711005566", role: "labour", note: "Farmhouse final coat", createdAt: daysAgo(40) },
    { id: "p-kiran", name: "Kiran Plumbing Works", phone: "9811556677", role: "subcontractor", note: "Shafts and toilets", createdAt: daysAgo(40) },
    { id: "p-jcb", name: "Desert Earthmovers", phone: "9800112233", role: "subcontractor", note: "JCB with diesel", createdAt: daysAgo(40) },
  ];

  const sites: Site[] = [
    { id: "s-green", name: "Greenfield Residency", location: "Sector 42, Gurugram", status: "active", clientPartyId: "p-mehta", createdAt: daysAgo(80) },
    { id: "s-nh", name: "NH-48 Culvert", location: "km 12.4, Rewari", status: "active", clientPartyId: "p-pwd", createdAt: daysAgo(60) },
    { id: "s-farm", name: "Sharma Farmhouse", location: "Sohna Road", status: "completed", clientPartyId: "p-sharma", createdAt: daysAgo(90) },
  ];

  const entries: Entry[] = [
    entry("e1", "p-mehta", "s-green", "bill", 840000, 45, "RA bill 2 — structure up to lintel"),
    entry("e2", "p-mehta", "s-green", "receipt", 500000, 32, "NEFT against RA-2"),
    entry("e3", "p-mehta", "s-green", "bill", 620000, 14, "RA bill 3 — Block B slab"),
    entry("e4", "p-mehta", "s-green", "receipt", 200000, 3, "NEFT part payment"),
    entry("e5", "p-pwd", "s-nh", "bill", 350000, 21, "Bill 1 — culvert package"),
    entry("e6", "p-pwd", "s-nh", "receipt", 150000, 9, "Cheque 441208"),
    entry("e7", "p-sharma", "s-farm", "bill", 240000, 50, "Final bill — farmhouse complete"),
    entry("e8", "p-sharma", "s-farm", "receipt", 240000, 40, "Full and final"),
    entry("e9", "p-bharat", "s-green", "purchase", 96000, 20, "UltraTech 200 bags"),
    entry("e10", "p-bharat", "s-green", "purchase", 90000, 11, "TMT steel 1.5 ton"),
    entry("e11", "p-bharat", "s-green", "supplier_paid", 120000, 6, "RTGS"),
    entry("e12", "p-yamuna", "s-green", "purchase", 54000, 18, "3 trolleys coarse sand"),
    entry("e13", "p-yamuna", "s-green", "supplier_paid", 54000, 16, "Cash at site"),
    entry("e14", "p-om", "s-green", "purchase", 38500, 8, "Conduit, wires, DB — Block B"),
    entry("e15", "p-om", "s-green", "supplier_paid", 20000, 2, "Part cash"),
    entry("e16", "p-raju", "s-green", "wages_due", 36000, 24, "Week 1 — 6 masons"),
    entry("e17", "p-raju", "s-green", "wages_paid", 30000, 23, "Cash"),
    entry("e18", "p-raju", "s-green", "wages_due", 42000, 17, "Week 2 — slab shuttering"),
    entry("e19", "p-raju", "s-green", "wages_paid", 40000, 16, "Cash"),
    entry("e20", "p-raju", "s-green", "wages_due", 38000, 10, "Week 3"),
    entry("e21", "p-raju", "s-green", "wages_paid", 20000, 5, "Part payment"),
    entry("e22", "p-raju", "s-green", "wages_paid", 8000, 0, "Today — mason advance against week 3"),
    entry("e23", "p-suresh", "s-green", "wages_due", 28000, 15, "Bar bending, Block B"),
    entry("e24", "p-suresh", "s-green", "advance", 10000, 13, "Advance — family function"),
    entry("e25", "p-suresh", "s-green", "wages_paid", 15000, 7, "Balance wages"),
    entry("e26", "p-imran", "s-farm", "wages_due", 22000, 27, "Final coat, farmhouse"),
    entry("e27", "p-imran", "s-farm", "wages_paid", 22000, 26, "Settled"),
    entry("e28", "p-kiran", "s-green", "sub_bill", 95000, 19, "Plumbing shaft + toilets, Block A"),
    entry("e29", "p-kiran", "s-green", "sub_paid", 60000, 12, "Part"),
    entry("e30", "p-jcb", "s-green", "sub_bill", 24000, 22, "JCB 8 hrs, foundation pit"),
    entry("e31", "p-jcb", "s-nh", "sub_bill", 24000, 7, "JCB backfill, culvert"),
    entry("e32", "p-jcb", "s-nh", "sub_paid", 32000, 4, "Cash, balance still open"),
  ];

  return {
    businessName: "Aarav Constructions",
    parties,
    sites,
    entries,
    showSampleHint: true,
  };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseBooks(value: unknown): Books | null {
  if (!isRecord(value)) return null;
  if (typeof value.businessName !== "string" || !value.businessName.trim()) return null;
  if (!Array.isArray(value.parties) || !Array.isArray(value.sites) || !Array.isArray(value.entries)) {
    return null;
  }

  const parties: Party[] = [];
  for (const item of value.parties) {
    if (!isRecord(item)) return null;
    if (typeof item.id !== "string" || typeof item.name !== "string") return null;
    if (!PARTY_ROLES.includes(item.role as PartyRole)) return null;
    parties.push({
      id: item.id,
      name: item.name.trim(),
      phone: typeof item.phone === "string" ? item.phone : "",
      role: item.role as PartyRole,
      note: typeof item.note === "string" ? item.note : "",
      createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString(),
    });
  }

  const partyIds = new Set(parties.map((party) => party.id));
  const sites: Site[] = [];
  for (const item of value.sites) {
    if (!isRecord(item)) return null;
    if (typeof item.id !== "string" || typeof item.name !== "string") return null;
    if (!SITE_STATUSES.includes(item.status as SiteStatus)) return null;
    const clientPartyId = typeof item.clientPartyId === "string" ? item.clientPartyId : null;
    sites.push({
      id: item.id,
      name: item.name.trim(),
      location: typeof item.location === "string" ? item.location : "",
      status: item.status as SiteStatus,
      clientPartyId: clientPartyId && partyIds.has(clientPartyId) ? clientPartyId : null,
      createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString(),
    });
  }

  const siteIds = new Set(sites.map((site) => site.id));
  const entries: Entry[] = [];
  for (const item of value.entries) {
    if (!isRecord(item)) return null;
    if (typeof item.id !== "string" || typeof item.partyId !== "string") return null;
    if (!partyIds.has(item.partyId)) return null;
    if (!ENTRY_KINDS.includes(item.kind as EntryKind)) return null;
    if (typeof item.amount !== "number" || !Number.isFinite(item.amount) || item.amount < 0) return null;
    if (typeof item.date !== "string" || !DATE_RE.test(item.date)) return null;
    const siteId = typeof item.siteId === "string" ? item.siteId : null;
    entries.push({
      id: item.id,
      partyId: item.partyId,
      siteId: siteId && siteIds.has(siteId) ? siteId : null,
      kind: item.kind as EntryKind,
      amount: item.amount,
      date: item.date,
      note: typeof item.note === "string" ? item.note : "",
      createdAt: typeof item.createdAt === "string" ? item.createdAt : `${item.date}T08:00:00.000Z`,
    });
  }

  return {
    businessName: value.businessName.trim(),
    parties,
    sites,
    entries,
    showSampleHint: false,
  };
}
