/**
 * Phone ↔ PC sync: change tracking and merging of the books.
 *
 * Every record carries a "last changed" time in `SyncMeta.updated`; deleting
 * a record leaves a tombstone time in `SyncMeta.deleted`. Two copies of the
 * books merge record by record: the newest change wins, and a deletion wins
 * over any change made before it. Records never edited since sync was turned
 * on have time 0, so any real edit beats them.
 */

export const COLLECTIONS = ["parties", "sites", "entries", "bills", "items", "stockAdjustments"] as const;
export type Coll = (typeof COLLECTIONS)[number];

type Stamps = Record<Coll, Record<string, number>>;

export type SyncMeta = {
  updated: Stamps;
  deleted: Stamps;
  /** When the firm name last changed. */
  nameAt: number;
};

type Rec = { id: string };

export type SyncData = { businessName: string } & Record<Coll, Rec[]>;

/** What is stored on the PC and exchanged between devices. */
export type SyncDoc = { v: 1; data: SyncData; meta: SyncMeta };

function emptyStamps(): Stamps {
  return Object.fromEntries(COLLECTIONS.map((coll) => [coll, {}])) as Stamps;
}

export function emptyMeta(): SyncMeta {
  return { updated: emptyStamps(), deleted: emptyStamps(), nameAt: 0 };
}

/** Fill in missing parts (older saved meta, or a doc from an older app). */
export function normalizeMeta(meta: Partial<SyncMeta> | undefined): SyncMeta {
  const base = emptyMeta();
  for (const coll of COLLECTIONS) {
    base.updated[coll] = { ...(meta?.updated?.[coll] ?? {}) };
    base.deleted[coll] = { ...(meta?.deleted?.[coll] ?? {}) };
  }
  base.nameAt = meta?.nameAt ?? 0;
  return base;
}

/**
 * Stamp what changed between two states of the books (records are replaced,
 * never mutated, so a new object means an edit). Returns the new meta, or
 * null if no synced data changed.
 */
export function trackChanges(prev: SyncData, next: SyncData, meta: SyncMeta, now: number): SyncMeta | null {
  let out: SyncMeta | null = null;
  const edit = () => (out ??= normalizeMeta(meta));
  for (const coll of COLLECTIONS) {
    const before = prev[coll];
    const after = next[coll];
    if (before === after) continue;
    const old = new Map(before.map((rec) => [rec.id, rec]));
    for (const rec of after) {
      if (old.get(rec.id) !== rec) {
        const m = edit();
        m.updated[coll][rec.id] = now;
        delete m.deleted[coll][rec.id];
      }
      old.delete(rec.id);
    }
    for (const id of old.keys()) {
      const m = edit();
      m.deleted[coll][id] = now;
      delete m.updated[coll][id];
    }
  }
  if (prev.businessName !== next.businessName) edit().nameAt = now;
  return out;
}

/** Merge two copies of the books. `a`'s order is kept; records only in `b` follow. */
export function mergeDocs(a: SyncDoc, b: SyncDoc): SyncDoc {
  const am = normalizeMeta(a.meta);
  const bm = normalizeMeta(b.meta);
  const meta = emptyMeta();
  const data = {} as SyncData;

  for (const coll of COLLECTIONS) {
    const aRecs = new Map(a.data[coll].map((rec) => [rec.id, rec]));
    const bRecs = new Map(b.data[coll].map((rec) => [rec.id, rec]));
    const order = [...aRecs.keys(), ...[...bRecs.keys()].filter((id) => !aRecs.has(id))];
    const tombstones = new Set([...Object.keys(am.deleted[coll]), ...Object.keys(bm.deleted[coll])]);
    const out: Rec[] = [];

    for (const id of order) {
      const ar = aRecs.get(id);
      const br = bRecs.get(id);
      const at = ar ? (am.updated[coll][id] ?? 0) : -1;
      const bt = br ? (bm.updated[coll][id] ?? 0) : -1;
      const [rec, ts] = at >= bt ? [ar!, at] : [br!, bt];
      const del = Math.max(am.deleted[coll][id] ?? -1, bm.deleted[coll][id] ?? -1);
      if (del >= 0 && del >= ts) {
        meta.deleted[coll][id] = del;
      } else {
        out.push(rec);
        if (ts > 0) meta.updated[coll][id] = ts;
      }
      tombstones.delete(id);
    }
    // Tombstones for records neither side still has.
    for (const id of tombstones) {
      meta.deleted[coll][id] = Math.max(am.deleted[coll][id] ?? 0, bm.deleted[coll][id] ?? 0);
    }
    data[coll] = out;
  }

  if (am.nameAt >= bm.nameAt) {
    data.businessName = a.data.businessName;
    meta.nameAt = am.nameAt;
  } else {
    data.businessName = b.data.businessName;
    meta.nameAt = bm.nameAt;
  }
  return { v: 1, data, meta };
}

/** Same books? (ignores key order inside records only if identical JSON) */
export function sameDoc(a: SyncDoc | null, b: SyncDoc | null) {
  return JSON.stringify(a) === JSON.stringify(b);
}
