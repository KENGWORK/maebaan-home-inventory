import { TODAY_ISO } from "./data.js";
import type { Hist, Item, Kind, Loc } from "./data.js";
import { applyAdd, applyMove, applyUse } from "./logic.js";

export interface Snapshot {
  items: Item[];
  locations: Loc[];
  history: Hist[];
}

export type AddRow = {
  name: string;
  kind: Kind;
  qty: number;
  loc: string;
  expMode: "days" | "date";
  expVal: string;
};

export type Msg =
  | { type: "add"; addRows: AddRow[]; photos?: string[] }
  | { type: "move"; moveRows: { itemId: number | null; qty: number; to: string }[]; photos?: string[] }
  | { type: "use"; useId: number | null; useQty: number; photos?: string[] }
  | { type: "newItem"; name: string; kind: Kind }
  | { type: "delItem"; id: number }
  | { type: "setItemField"; id: number; min?: number; target?: number; noStock?: boolean }
  | { type: "newPlace"; code: string; name: string; room: string }
  | { type: "renamePlace"; code: string; name?: string; room?: string }
  | { type: "setPlaceCode"; code: string; newCode: string }
  | { type: "delPlace"; code: string };

export type MutationResult =
  | { snapshot: Snapshot; result: Record<string, unknown> }
  | { error: string };

const label = (code: string, room: string, name: string) => `${code} · ${room} – ${name}`;

export function applyMutation(snap: Snapshot, msg: Msg, owner: string): MutationResult {
  const items = snap.items.map((i) => ({ ...i }));
  const locations = snap.locations.map((l) => ({ ...l }));
  const history = snap.history.slice();

  switch (msg.type) {
    case "add": {
      const r = applyAdd(items, history, msg.addRows, owner, undefined, msg.photos ?? []);
      if ("error" in r) return { error: r.error };
      return { snapshot: { items: r.items, locations, history: r.hist }, result: { added: r.added } };
    }
    case "move": {
      const r = applyMove(items, history, msg.moveRows, owner, msg.photos ?? []);
      if ("error" in r) return { error: r.error };
      return {
        snapshot: { items: r.items, locations, history: r.hist },
        result: { moved: r.moved, firstTo: r.firstTo },
      };
    }
    case "use": {
      const r = applyUse(items, history, msg.useId, msg.useQty, owner, msg.photos ?? []);
      if ("error" in r) return { error: r.error };
      return {
        snapshot: { items: r.items, locations, history: r.hist },
        result: { left: r.left, used: r.used, name: r.name },
      };
    }
    case "newItem": {
      const name = msg.name.trim();
      if (!name) return { error: "ใส่ชื่อของก่อน" };
      const dup = items.find((i) => i.name.trim().toLowerCase() === name.toLowerCase());
      if (dup) return { error: `⚠ มี “${name}” อยู่แล้วที่ ${dup.loc} — ใช้ ADD เพื่อเพิ่มจำนวนแทน` };
      items.push({
        id: Math.max(0, ...items.map((i) => i.id)) + 1,
        name,
        kind: msg.kind,
        qty: 0,
        loc: "",
        owner,
        date: TODAY_ISO,
        exp: undefined,
        min: 1,
        target: 2,
      });
      return { snapshot: { items, locations, history }, result: {} };
    }
    case "delItem": {
      if (!items.some((i) => i.id === msg.id)) return { error: "ไม่พบรายการ" };
      return {
        snapshot: { items: items.filter((i) => i.id !== msg.id), locations, history },
        result: {},
      };
    }
    case "setItemField": {
      if (!items.some((i) => i.id === msg.id)) return { error: "ไม่พบรายการ" };
      const next = items.map((i) =>
        i.id === msg.id
          ? {
              ...i,
              min: msg.min ?? i.min,
              target: msg.target ?? i.target,
              noStock: msg.noStock ?? i.noStock,
            }
          : i,
      );
      return { snapshot: { items: next, locations, history }, result: {} };
    }
    case "newPlace": {
      const code = msg.code.trim().toUpperCase();
      const name = msg.name.trim();
      const room = msg.room.trim();
      if (!room) return { error: "ระบุ location หลักก่อน" };
      if (!name) return { error: "ใส่ชื่อ location รองก่อน" };
      if (locations.some((l) => l.code === code)) return { error: `⚠ รหัส ${code} ถูกใช้แล้ว — ต้องไม่ซ้ำ` };
      if (locations.some((l) => l.room === room && l.name === name)) return { error: `⚠ มี “${room} – ${name}” อยู่แล้ว` };
      locations.push({ code, name, room, label: label(code, room, name) });
      return { snapshot: { items, locations, history }, result: {} };
    }
    case "renamePlace": {
      // An out-of-sync client (or a hand-rolled body) must get a 400, not a
      // silent no-op that reads as a successful save.
      if (!locations.some((l) => l.code === msg.code)) return { error: "ไม่พบ location" };
      const next = locations.map((l) => {
        if (l.code !== msg.code) return l;
        const name = msg.name ?? l.name;
        const room = msg.room ?? l.room;
        return { ...l, name, room, label: label(l.code, room, name) };
      });
      return { snapshot: { items, locations: next, history }, result: {} };
    }
    case "setPlaceCode": {
      const newCode = msg.newCode.trim().toUpperCase();
      if (!newCode) return { error: "รหัส location ห้ามว่าง" };
      if (!locations.some((l) => l.code === msg.code)) return { error: "ไม่พบ location" };
      if (locations.some((l) => l.code === newCode && l.code !== msg.code))
        return { error: `⚠ รหัส ${newCode} ถูกใช้แล้ว — ต้องไม่ซ้ำ` };
      const nextLocs = locations.map((l) =>
        l.code === msg.code ? { ...l, code: newCode, label: label(newCode, l.room, l.name) } : l,
      );
      const nextItems = items.map((i) => (i.loc === msg.code ? { ...i, loc: newCode } : i));
      return { snapshot: { items: nextItems, locations: nextLocs, history }, result: {} };
    }
    case "delPlace": {
      if (items.some((i) => i.loc === msg.code && i.qty > 0))
        return { error: `ยังมีของอยู่ใน ${msg.code} — ย้ายของออกก่อนลบ` };
      return {
        snapshot: { items, locations: locations.filter((l) => l.code !== msg.code), history },
        result: {},
      };
    }
    default:
      // Belt-and-braces: the union above is exhaustive, but a hand-rolled HTTP
      // body can still carry an unknown `type` — that is a 400, not a crash.
      return { error: "unknown mutation" };
  }
}
