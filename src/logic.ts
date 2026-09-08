// Pure domain logic ported from design/Home Inventory.dc.html.
// Everything here is side-effect free so it can be unit tested and reused by the UI.

import { HIST, ITEMS, LOCS, nowStamp, todayDate, todayISO } from "./data.js";
import type { Hist, Item, Loc } from "./data.js";

/** Next free item id: max existing + 1 (deterministic, unlike Date.now()). */
const nextId = (items: Item[]): number => Math.max(0, ...items.map((i) => i.id)) + 1;

export const DAY_MS = 86_400_000;

/** Whole days from `today` until the EXP date (negative = already expired). */
export function days(exp: string | null | undefined, today: Date = todayDate()): number | null {
  if (!exp) return null;
  return Math.round((new Date(`${exp}T09:00:00`).getTime() - today.getTime()) / DAY_MS);
}

export function locOf(locs: Loc[], code: string): Loc | null {
  return locs.find((l) => l.code === code) ?? null;
}

export function locLabel(locs: Loc[], code: string): string {
  const l = locOf(locs, code);
  return l ? `${l.room} – ${l.name}` : "—";
}

export function itemOf(items: Item[], id: number | null): Item | undefined {
  if (id == null) return undefined;
  return items.find((i) => i.id === id);
}

const ROOM_PREFIX: Record<string, string> = {
  ห้องนอน: "BED",
  ห้องนอนใหญ่: "MAS",
  ห้องนอนเล็ก: "SML",
  โรงรถ: "GAR",
  ห้องครัว: "KIT",
  ห้องน้ำ: "BAT",
  ห้องนั่งเล่น: "LIV",
  ห้องทำงาน: "OFF",
};

/** Next free location code for a room, e.g. KIT-04 / new room -> OFF-01 / LOC fallback. */
export function autoCode(locs: Loc[], room: string): string {
  const same = locs.filter((l) => l.room === room);
  let prefix: string;
  if (same.length) {
    prefix = same[0].code.split("-")[0];
  } else {
    prefix = ROOM_PREFIX[room];
    if (!prefix) {
      const en = (room || "").replace(/[^A-Za-z]/g, "").toUpperCase();
      prefix = en.length >= 3 ? en.slice(0, 3) : "LOC";
      if (prefix === "LOC") {
        let i = 1;
        while (locs.filter((l) => l.code.split("-")[0] === `L${i < 10 ? "0" : ""}${i}`).length) i++;
        prefix = `L${i < 10 ? "0" : ""}${i}`;
      }
    }
  }
  let n = 1;
  let code: string;
  do {
    code = `${prefix}-${n < 10 ? "0" : ""}${n}`;
    n++;
  } while (locs.filter((l) => l.code === code).length);
  return code;
}

/** Location search used by the ADD / MOVE pickers. Returns matching locs (max 5). */
export function locSug(locs: Loc[], q: string, code: string): Loc[] {
  const qq = (q || "").trim().toLowerCase();
  if (!qq) return [];
  const hit = locs.filter((l) => (l.name + l.room + l.code).toLowerCase().includes(qq));
  if (hit.length === 1 && hit[0].code === code) return [];
  return hit.slice(0, 5);
}

export type ShopGroup = "out" | "low" | "bought";

export interface ShopRow {
  name: string;
  qty: number;
  min: number;
  code: string;
  kind: Item["kind"];
  group: ShopGroup;
}

/** Aggregate stock-tracked items by name -> shopping list rows (out / low / bought). */
export function shopRows(items: Item[], bought: string[]): ShopRow[] {
  const agg: Record<string, Omit<ShopRow, "group">> = {};
  items.forEach((i) => {
    if (i.noStock) return;
    if (!agg[i.name]) agg[i.name] = { name: i.name, qty: 0, min: i.min, code: i.loc, kind: i.kind };
    agg[i.name].qty += i.qty;
    agg[i.name].min = Math.max(agg[i.name].min, i.min);
  });
  const out: ShopRow[] = [];
  Object.keys(agg).forEach((k) => {
    const a = agg[k];
    let group: ShopGroup;
    if (a.qty <= 0) group = "out";
    else if (a.qty <= a.min) group = "low";
    else return;
    if (bought.includes(k)) group = "bought";
    out.push({ ...a, group });
  });
  return out;
}

export interface HomeDerived {
  expiring: Item[];
  out: Item[];
  low: Item[];
  totalQty: number;
  ready: number;
}

export function homeDerived(items: Item[], today: Date = todayDate()): HomeDerived {
  const expiring = items.filter((i) => {
    const d = days(i.exp, today);
    return i.qty > 0 && d !== null && d <= 3;
  });
  const out = items.filter((i) => !i.noStock && i.qty <= 0);
  const low = items.filter((i) => !i.noStock && i.qty > 0 && i.qty <= i.min);
  const totalQty = items.reduce((a, i) => a + i.qty, 0);
  const tracked = items.filter((i) => !i.noStock);
  const ready = tracked.length
    ? Math.round((tracked.filter((i) => i.qty > i.min).length / tracked.length) * 100)
    : 100;
  return { expiring, out, low, totalQty, ready };
}

// ── mutating flows (return new arrays, never touch the inputs) ─────────────────

export interface AddRow {
  name: string;
  kind: Item["kind"];
  qty: number;
  loc: string;
  expMode: "days" | "date";
  expVal: string;
}

/** union of two photo-id lists, order-preserving, no dupes */
const mergePhotos = (a: string[] | undefined, b: string[] | undefined): string[] | undefined => {
  const out = [...new Set([...(a ?? []), ...(b ?? [])])];
  return out.length ? out : undefined;
};

export function applyAdd(
  items: Item[],
  hist: Hist[],
  addRows: AddRow[],
  owner: string,
  today: Date = todayDate(),
  photos: string[] = [],
): { items: Item[]; hist: Hist[]; added: number } | { error: string } {
  const rows = addRows.filter((r) => r.name.trim() && r.loc);
  if (!rows.length) return { error: "กรอกชื่อของและเลือกสถานที่ก่อนบันทึก" };
  const stamp = todayISO();
  const nextItems = items.map((i) => ({ ...i }));
  const nextHist = hist.slice();
  let added = 0;
  rows.forEach((r) => {
    let exp: string | null = null;
    if (r.kind === "food" && r.expVal) {
      if (r.expMode === "days") {
        exp = new Date(today.getTime() + (parseInt(r.expVal, 10) || 0) * DAY_MS)
          .toISOString()
          .slice(0, 10);
      } else {
        exp = r.expVal;
      }
    }
    const name = r.name.trim();
    const ex = nextItems.find((i) => i.name === name && i.loc === r.loc);
    if (ex) {
      ex.qty += r.qty;
      ex.date = stamp;
      if (exp) ex.exp = exp;
      ex.photos = mergePhotos(ex.photos, photos);
    } else {
      nextItems.push({
        id: nextId(nextItems),
        name,
        kind: r.kind,
        qty: r.qty,
        loc: r.loc,
        owner,
        date: stamp,
        exp,
        min: 1,
        target: Math.max(2, r.qty),
        photos: photos.length ? [...photos] : undefined,
      });
    }
    nextHist.unshift({
      evt: "ADD", name, qty: r.qty, to: r.loc, who: owner, date: nowStamp(),
      photos: photos.length ? [...photos] : undefined,
    });
    added++;
  });
  return { items: nextItems, hist: nextHist, added };
}

export interface MoveRow {
  itemId: number | null;
  qty: number;
  to: string;
}

export function applyMove(
  items: Item[],
  hist: Hist[],
  moveRows: MoveRow[],
  owner: string,
  photos: string[] = [],
): { items: Item[]; hist: Hist[]; moved: number; firstTo: string } | { error: string } {
  const rows = moveRows.filter((r) => r.itemId && r.to);
  if (!rows.length) return { error: "เลือกของและสถานที่ใหม่ก่อนบันทึก" };
  const nextItems = items.map((i) => ({ ...i }));
  const nextHist = hist.slice();
  const stamp = todayISO();
  rows.forEach((r) => {
    const src = nextItems.find((i) => i.id === r.itemId);
    if (!src) return;
    const qty = Math.min(r.qty, src.qty);
    const from = src.loc;
    src.qty -= qty;
    src.date = stamp;
    const dst = nextItems.find((i) => i.name === src.name && i.loc === r.to);
    if (dst) {
      dst.qty += qty;
      dst.photos = mergePhotos(dst.photos, [...(src.photos ?? []), ...photos]);
    } else {
      nextItems.push({
        id: nextId(nextItems),
        name: src.name,
        kind: src.kind,
        qty,
        loc: r.to,
        owner,
        date: stamp,
        exp: src.exp,
        min: src.min,
        target: src.target,
        photos: mergePhotos(src.photos, photos),
      });
    }
    nextHist.unshift({
      evt: "MOVE", name: src.name, qty, from, to: r.to, who: owner, date: nowStamp(),
      photos: photos.length ? [...photos] : undefined,
    });
  });
  return {
    items: nextItems.filter((i) => i.qty > 0 || i.min > 0),
    hist: nextHist,
    moved: rows.length,
    firstTo: rows[0].to,
  };
}

export function applyUse(
  items: Item[],
  hist: Hist[],
  useId: number | null,
  useQty: number,
  owner: string,
  photos: string[] = [],
): { items: Item[]; hist: Hist[]; left: number; used: number; name: string } | { error: string } {
  const it = itemOf(items, useId);
  if (!it) return { error: "เลือกของที่จะใช้ก่อน" };
  const q = Math.min(useQty, it.qty);
  const nextItems = items.map((i) => (i.id === it.id ? { ...i, qty: i.qty - q, date: todayISO() } : i));
  const nextHist = hist.slice();
  nextHist.unshift({
    evt: "USE", name: it.name, qty: q, to: it.loc, who: owner, date: nowStamp(),
    photos: photos.length ? [...photos] : undefined,
  });
  return { items: nextItems, hist: nextHist, left: it.qty - q, used: q, name: it.name };
}

// Re-exported so tests / callers get a clean fresh copy of the seeds.
export const freshItems = (): Item[] => ITEMS.map((i) => ({ ...i }));
export const freshHist = (): Hist[] => HIST.slice();
export const freshLocs = (): Loc[] => LOCS.map((l) => ({ ...l }));
