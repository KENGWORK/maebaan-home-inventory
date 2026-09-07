# Maebaan Sheets Backend + Vercel Deploy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the in-memory Maebaan app persist to a Google Sheet via Vercel serverless functions, deployed from a GitHub repo with push-to-deploy.

**Architecture:** The pure reducers already in `src/logic.ts` are wrapped by a new shared dispatcher `src/mutations.ts`. Vercel functions under `api/` read the Sheet, run that dispatcher, write the Sheet back, and return a fresh snapshot. The React client runs the same dispatcher optimistically, then reconciles with the server response.

**Tech Stack:** Vite + React 18 + TypeScript, Vitest, `@vercel/node` serverless functions, Google Sheets REST API v4 authed with `google-auth-library` JWT, deployed on Vercel from GitHub.

## Global Constraints

- Node ≥ 18, `"type": "module"` — all new files are ESM.
- The service-account key lives **only** in the Vercel env var `GOOGLE_SERVICE_ACCOUNT_JSON`. It must never be written to a committed file, logged, or returned to the client.
- Sheet ID comes from env var `SHEET_ID`.
- `private_key` from the key JSON may contain literal `\n`; JWT construction must `.replace(/\\n/g, "\n")`.
- Concurrency model: last-write-wins. `items` and `locations` tabs are rewritten in full on every mutation; `history` is append-only.
- Column keys per tab, row 1 = header, exact order:
  - `items`: `id, name, kind, qty, loc, owner, date, exp, min, target, noStock`
  - `locations`: `code, name, room`
  - `history`: `ts, evt, name, qty, from, to, who`
- `bought` (shopping-list ticks) stays client-only in v1 — not in the snapshot, not sent to the server.
- Pinned "today" for seeds/reducers stays `2026-09-06` (`src/data.ts` `TODAY`).
- Thai UI strings unchanged from the current app.
- TDD: failing test → run it fails → minimal impl → run it passes → commit.

---

## File Structure

```
src/mutations.ts        NEW  central pure dispatcher: applyMutation(snapshot, msg) -> {snapshot, result} | {error}
src/mutations.test.ts   NEW  one test per mutation type
src/api.ts              NEW  client: fetchState(), mutate(); Snapshot type
src/App.tsx             MOD  mount-fetch, optimistic mutate + reconcile, loading/offline UI
src/data.ts             MOD  export SEED snapshot helper for /api/init
api/_sheets.ts          NEW  SheetsClient iface + JWT impl, row<->object mappers, readState/writeSnapshot/ensureTabs
api/_fakeClient.ts      NEW  shared in-memory SheetsClient for tests
api/_sheets.test.ts     NEW  mapper round-trips + readState/writeSnapshot against a fake client
api/_run.ts             NEW  runMutation(client, msg): reads, dispatches, writes, returns snapshot+result
api/_run.test.ts        NEW  runMutation against a fake in-memory client
api/state.ts            NEW  GET  -> readState()
api/mutate.ts           NEW  POST -> runMutation()
api/init.ts             NEW  POST -> ensureTabs() + seed if empty
vercel.json             NEW  { "framework": "vite" }
tsconfig.json           MOD  add "api" to include; add "node" to types
package.json            MOD  deps: google-auth-library; devDeps: @vercel/node, @types/node; script "vercel-dev"
```

Existing `src/logic.ts` / `src/logic.test.ts` are **not** modified.

---

## Task 1: Shared mutation dispatcher

**Files:**
- Create: `src/mutations.ts`
- Test: `src/mutations.test.ts`

**Interfaces:**
- Consumes: from `src/logic.ts` — `applyAdd(items, hist, addRows, owner)`, `applyMove(items, hist, moveRows, owner)`, `applyUse(items, hist, useId, useQty, owner)` (each returns its success object or `{ error: string }`); types `Item`, `Loc`, `Hist`, `Kind` from `src/data.ts`; `TODAY_ISO` from `src/data.ts`.
- Produces:
  ```ts
  export interface Snapshot { items: Item[]; locations: Loc[]; history: Hist[]; }
  export type Msg =
    | { type: "add"; addRows: AddRow[] }
    | { type: "move"; moveRows: { itemId: number | null; qty: number; to: string }[] }
    | { type: "use"; useId: number | null; useQty: number }
    | { type: "newItem"; name: string; kind: Kind }
    | { type: "delItem"; id: number }
    | { type: "setItemField"; id: number; min?: number; target?: number; noStock?: boolean }
    | { type: "newPlace"; code: string; name: string; room: string }
    | { type: "renamePlace"; code: string; name?: string; room?: string }
    | { type: "setPlaceCode"; code: string; newCode: string }
    | { type: "delPlace"; code: string };
  export type AddRow = { name: string; kind: Kind; qty: number; loc: string; expMode: "days" | "date"; expVal: string };
  export type MutationResult =
    | { snapshot: Snapshot; result: Record<string, unknown> }
    | { error: string };
  export function applyMutation(snap: Snapshot, msg: Msg, owner: string): MutationResult;
  ```
  `result` carries the reducer extras the client needs for toasts: `add` → `{ added }`, `move` → `{ moved, firstTo }`, `use` → `{ left, used, name }`, others → `{}`.

- [ ] **Step 1: Write the failing test**

```ts
// src/mutations.test.ts
import { describe, expect, it } from "vitest";
import { applyMutation, type Snapshot } from "./mutations";
import { freshHist, freshItems, freshLocs } from "./logic";

const snap = (): Snapshot => ({ items: freshItems(), locations: freshLocs(), history: freshHist() });

describe("applyMutation", () => {
  it("add: merges into existing name+loc and appends history", () => {
    const r = applyMutation(snap(), { type: "add", addRows: [
      { name: "สบู่", kind: "supply", qty: 3, loc: "BAT-01", expMode: "days", expVal: "" },
    ] }, "omo");
    if ("error" in r) throw new Error(r.error);
    expect(r.result).toMatchObject({ added: 1 });
    expect(r.snapshot.items.find(i => i.name === "สบู่" && i.loc === "BAT-01")!.qty).toBe(5);
    expect(r.snapshot.history[0]).toMatchObject({ evt: "ADD", name: "สบู่", qty: 3 });
  });

  it("use: decrements and reports left/used", () => {
    const s = snap();
    const tissue = s.items.find(i => i.name === "ทิชชู่")!;
    const r = applyMutation(s, { type: "use", useId: tissue.id, useQty: 5 }, "omo");
    if ("error" in r) throw new Error(r.error);
    expect(r.result).toMatchObject({ left: 0, used: 1, name: "ทิชชู่" });
  });

  it("newItem: appends a qty-0 item", () => {
    const r = applyMutation(snap(), { type: "newItem", name: "ถ่าน AA", kind: "supply" }, "เก่ง");
    if ("error" in r) throw new Error(r.error);
    const it = r.snapshot.items.find(i => i.name === "ถ่าน AA")!;
    expect(it).toMatchObject({ qty: 0, kind: "supply", min: 1, target: 2 });
  });

  it("newItem: rejects a duplicate name", () => {
    const r = applyMutation(snap(), { type: "newItem", name: "สบู่", kind: "supply" }, "เก่ง");
    expect(r).toEqual({ error: expect.any(String) });
  });

  it("delItem: removes the row", () => {
    const s = snap();
    const id = s.items[0].id;
    const r = applyMutation(s, { type: "delItem", id }, "เก่ง");
    if ("error" in r) throw new Error(r.error);
    expect(r.snapshot.items.some(i => i.id === id)).toBe(false);
  });

  it("setItemField: patches min/target/noStock", () => {
    const s = snap();
    const id = s.items.find(i => i.name === "สบู่")!.id;
    const r = applyMutation(s, { type: "setItemField", id, min: 4, noStock: true }, "เก่ง");
    if ("error" in r) throw new Error(r.error);
    expect(r.snapshot.items.find(i => i.id === id)).toMatchObject({ min: 4, noStock: true });
  });

  it("newPlace: appends a location; rejects duplicate code", () => {
    const ok = applyMutation(snap(), { type: "newPlace", code: "OFF-01", name: "โต๊ะ", room: "ห้องทำงาน" }, "เก่ง");
    if ("error" in ok) throw new Error(ok.error);
    expect(ok.snapshot.locations.find(l => l.code === "OFF-01")).toMatchObject({ room: "ห้องทำงาน" });
    const dup = applyMutation(snap(), { type: "newPlace", code: "KIT-01", name: "x", room: "ห้องครัว" }, "เก่ง");
    expect(dup).toEqual({ error: expect.any(String) });
  });

  it("renamePlace: patches name/room and keeps label in sync", () => {
    const r = applyMutation(snap(), { type: "renamePlace", code: "KIT-01", name: "ตู้ล่าง" }, "เก่ง");
    if ("error" in r) throw new Error(r.error);
    const l = r.snapshot.locations.find(x => x.code === "KIT-01")!;
    expect(l.name).toBe("ตู้ล่าง");
    expect(l.label).toContain("ตู้ล่าง");
  });

  it("setPlaceCode: renames code and cascades to items.loc; rejects duplicate", () => {
    const r = applyMutation(snap(), { type: "setPlaceCode", code: "KIT-01", newCode: "KITCHEN-1" }, "เก่ง");
    if ("error" in r) throw new Error(r.error);
    expect(r.snapshot.locations.some(l => l.code === "KIT-01")).toBe(false);
    expect(r.snapshot.items.every(i => i.loc !== "KIT-01")).toBe(true);
    const dup = applyMutation(snap(), { type: "setPlaceCode", code: "KIT-01", newCode: "KIT-02" }, "เก่ง");
    expect(dup).toEqual({ error: expect.any(String) });
  });

  it("delPlace: rejects while items with qty>0 remain, else removes", () => {
    const s = snap();
    const busy = applyMutation(s, { type: "delPlace", code: "BAT-01" }, "เก่ง");
    expect(busy).toEqual({ error: expect.any(String) });
    const empty = applyMutation(snap(), { type: "delPlace", code: "GAR-02" }, "เก่ง");
    if ("error" in empty) throw new Error(empty.error);
    expect(empty.snapshot.locations.some(l => l.code === "GAR-02")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/mutations.test.ts`
Expected: FAIL — `Cannot find module './mutations'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/mutations.ts
import { TODAY_ISO } from "./data";
import type { Hist, Item, Kind, Loc } from "./data";
import { applyAdd, applyMove, applyUse } from "./logic";

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
  | { type: "add"; addRows: AddRow[] }
  | { type: "move"; moveRows: { itemId: number | null; qty: number; to: string }[] }
  | { type: "use"; useId: number | null; useQty: number }
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
      const r = applyAdd(items, history, msg.addRows, owner);
      if ("error" in r) return { error: r.error };
      return { snapshot: { items: r.items, locations, history: r.hist }, result: { added: r.added } };
    }
    case "move": {
      const r = applyMove(items, history, msg.moveRows, owner);
      if ("error" in r) return { error: r.error };
      return {
        snapshot: { items: r.items, locations, history: r.hist },
        result: { moved: r.moved, firstTo: r.firstTo },
      };
    }
    case "use": {
      const r = applyUse(items, history, msg.useId, msg.useQty, owner);
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
        id: Date.now(),
        name,
        kind: msg.kind,
        qty: 0,
        loc: "",
        owner,
        date: TODAY_ISO,
        exp: null,
        min: 1,
        target: 2,
      });
      return { snapshot: { items, locations, history }, result: {} };
    }
    case "delItem": {
      return {
        snapshot: { items: items.filter((i) => i.id !== msg.id), locations, history },
        result: {},
      };
    }
    case "setItemField": {
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
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/mutations.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Run the full suite + typecheck**

Run: `npx vitest run && npx tsc -b`
Expected: all pass, no TS errors.

- [ ] **Step 6: Commit**

```bash
git add src/mutations.ts src/mutations.test.ts
git commit -m "feat: shared applyMutation dispatcher over logic.ts reducers"
```

---

## Task 2: Wire App.tsx to applyMutation (behavior-preserving refactor)

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `applyMutation`, `Snapshot`, `Msg` from `src/mutations.ts`.
- Produces: no new exports. `App` now holds `{ items, locations, history }` as a `Snapshot` and derives everything else; a local helper `dispatch(msg: Msg)` applies a mutation to state and flashes the toast. This is the seam Task 5 hooks the network onto.

- [ ] **Step 1: Add the dispatch helper**

In `src/App.tsx`, inside `App()`, after `flash` is defined, add:

```ts
const dispatch = (msg: Msg, toastFor?: (r: Record<string, unknown>) => string) => {
  const res = applyMutation({ items: s.items, locations: s.locs, history: s.hist }, msg, s.owner);
  if ("error" in res) {
    flash(res.error);
    return false;
  }
  set({ items: res.snapshot.items, locs: res.snapshot.locations, hist: res.snapshot.history });
  if (toastFor) flash(toastFor(res.result));
  return true;
};
```

(Note: current `State` uses `locs` and `hist` keys — keep those names; only the wire format in Task 5 uses `locations`/`history`.)

- [ ] **Step 2: Replace the inline flows with dispatch calls**

Replace `addSave`:
```ts
const addSave = () => {
  if (dispatch({ type: "add", addRows: s.addRows }, (r) => `บันทึกเก็บของ ${r.added} รายการ โดย ${s.owner}`))
    set({ screen: "inv", invMode: "item", invQuery: "", invLoc: null, addRows: [freshAddRow()] });
};
```

Replace `moveSave`:
```ts
const moveSave = () => {
  const res = applyMutation({ items: s.items, locations: s.locs, history: s.hist },
    { type: "move", moveRows: s.moveRows.map((r) => ({ itemId: r.itemId, qty: r.qty, to: r.to })) }, s.owner);
  if ("error" in res) return flash(res.error);
  set({
    items: res.snapshot.items, locs: res.snapshot.locations, hist: res.snapshot.history,
    screen: "inv", invMode: "loc", invLoc: (res.result.firstTo as string) ?? null, moveRows: [freshMoveRow()],
  });
  flash(`ย้าย ${res.result.moved} รายการ โดย ${s.owner}`);
};
```

Replace `useSave`:
```ts
const useSave = () => {
  const res = applyMutation({ items: s.items, locations: s.locs, history: s.hist },
    { type: "use", useId: s.useId, useQty: s.useQty }, s.owner);
  if ("error" in res) return flash(res.error);
  set({ items: res.snapshot.items, locs: res.snapshot.locations, hist: res.snapshot.history, useId: null, useQuery: "", useQty: 1 });
  const left = res.result.left as number;
  if (left <= 0) flash(`⚠ ${res.result.name} หมดแล้ว — เพิ่มเข้ารายการซื้ออัตโนมัติ`);
  else flash(`ใช้ ${res.result.name} ${res.result.used} หน่วย · เหลือ ${left}`);
};
```

In `build()`, replace every settings/place `set({ items: ... })` / `set({ locs: ... })` handler body with the matching `dispatch(...)` call. Concretely:
- `newItem` sheet action → `dispatch({ type: "newItem", name: S.sheetText.trim(), kind: S.newKind }, () => `เพิ่ม “${S.sheetText.trim()}” เข้ารายการแล้ว`)` then `set({ sheet: null, sheetText: "" })` on success.
- `delItem` sheet action → `dispatch({ type: "delItem", id: sheet.id }, () => `ลบ “${sheet.name}” แล้ว`)` then clear sheet.
- item `toggleTrack` → `dispatch({ type: "setItemField", id: i.id, noStock: !i.noStock })`.
- item min/target `patch` → `dispatch({ type: "setItemField", id: i.id, [k]: vv })`.
- `newPlace` sheet action → `dispatch({ type: "newPlace", code, name, room }, () => `สร้าง ${code} · ${room} – ${name} แล้ว`)` then reset place fields + `setTab: "places"`.
- place `setName` / `setRoom` → `dispatch({ type: "renamePlace", code: l.code, name?/room? })`.
- place `setCode` → `dispatch({ type: "setPlaceCode", code: l.code, newCode: vv })`.
- place `del` sheet action → `dispatch({ type: "delPlace", code: sheet.code }, () => `ลบสถานที่ ${sheet.code} แล้ว`)`.

Keep the `delItem`/`delPlace` "type Delete to confirm" gate exactly as-is in the UI; `dispatch` is only called after `ok`/`okP` is true.

- [ ] **Step 3: Run the browser smoke script**

Run: `npm run dev`, then in the app: ADD an item, MOVE it, USE it, add a place, rename it, delete an item. Confirm toasts and screens match pre-refactor behavior.

- [ ] **Step 4: Typecheck + build + tests**

Run: `npx tsc -b && npx vite build && npx vitest run`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "refactor: route all App mutations through applyMutation"
```

---

## Task 3: Sheet row mappers

**Files:**
- Create: `api/_sheets.ts` (mappers section only)
- Test: `api/_sheets.test.ts`
- Modify: `tsconfig.json` (add `"api"` to `include`, add `"node"` to `types`)
- Modify: `package.json` (devDep `@types/node`)

**Interfaces:**
- Consumes: types `Item`, `Loc`, `Hist` from `src/data.ts`.
- Produces:
  ```ts
  export const ITEM_COLS = ["id","name","kind","qty","loc","owner","date","exp","min","target","noStock"] as const;
  export const LOC_COLS = ["code","name","room"] as const;
  export const HIST_COLS = ["ts","evt","name","qty","from","to","who"] as const;
  export function rowsToItems(rows: string[][]): Item[];
  export function itemsToRows(items: Item[]): string[][];   // includes header row
  export function rowsToLocs(rows: string[][]): Loc[];
  export function locsToRows(locs: Loc[]): string[][];      // includes header row
  export function rowsToHistory(rows: string[][]): Hist[];
  export function historyToRows(hist: Hist[]): string[][];  // NO header (append use)
  ```

- [ ] **Step 1: Add deps + tsconfig**

```bash
npm i -D @types/node@^22
```

In `tsconfig.json`: `"include": ["src", "api"]` and `"types": ["vitest/globals", "node"]`.

- [ ] **Step 2: Write the failing test**

```ts
// api/_sheets.test.ts
import { describe, expect, it } from "vitest";
import { freshItems, freshLocs } from "../src/logic";
import {
  historyToRows, itemsToRows, locsToRows, rowsToHistory, rowsToItems, rowsToLocs,
} from "./_sheets";

describe("mappers", () => {
  it("items round-trip through rows", () => {
    const items = freshItems();
    const rows = itemsToRows(items);
    expect(rows[0]).toEqual(["id","name","kind","qty","loc","owner","date","exp","min","target","noStock"]);
    const back = rowsToItems(rows);
    expect(back).toEqual(items);
  });

  it("rowsToItems coerces numbers and noStock boolean, tolerates short rows", () => {
    const rows = [
      ["id","name","kind","qty","loc","owner","date","exp","min","target","noStock"],
      ["5","ยาลดไข้","food","8","MAS-02","omo","2026-07-19","2026-09-09","4","10",""],
      ["9","กระเป๋าตัง","supply","1","MAS-01","omo","2026-09-05","", "1","1","TRUE"],
    ];
    const out = rowsToItems(rows);
    expect(out[0]).toMatchObject({ id: 5, qty: 8, min: 4, target: 10, exp: "2026-09-09" });
    expect(out[0].noStock).toBeUndefined();
    expect(out[1]).toMatchObject({ id: 9, noStock: true });
    expect(out[1].exp).toBeUndefined();
  });

  it("locations round-trip and rebuild label", () => {
    const locs = freshLocs();
    const back = rowsToLocs(locsToRows(locs));
    expect(back).toEqual(locs);
  });

  it("history round-trips without a header row", () => {
    const hist = [{ evt: "MOVE" as const, name: "powerbank", qty: 1, from: "LIV-01", to: "GAR-01", who: "เก่ง", date: "2026-09-02 11:47" }];
    const rows = historyToRows(hist);
    expect(rows).toEqual([["2026-09-02 11:47","MOVE","powerbank","1","LIV-01","GAR-01","เก่ง"]]);
    expect(rowsToHistory([["ts","evt","name","qty","from","to","who"], ...rows])).toEqual(hist);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run api/_sheets.test.ts`
Expected: FAIL — `Cannot find module './_sheets'`.

- [ ] **Step 4: Write minimal implementation**

```ts
// api/_sheets.ts
import type { Hist, HistEvt, Item, Kind, Loc } from "../src/data";

export const ITEM_COLS = ["id","name","kind","qty","loc","owner","date","exp","min","target","noStock"] as const;
export const LOC_COLS = ["code","name","room"] as const;
export const HIST_COLS = ["ts","evt","name","qty","from","to","who"] as const;

const cell = (v: unknown) => (v === undefined || v === null ? "" : String(v));

export function itemsToRows(items: Item[]): string[][] {
  return [
    [...ITEM_COLS],
    ...items.map((i) => [
      cell(i.id), i.name, i.kind, cell(i.qty), i.loc, i.owner, i.date,
      cell(i.exp), cell(i.min), cell(i.target), i.noStock ? "TRUE" : "",
    ]),
  ];
}

export function rowsToItems(rows: string[][]): Item[] {
  return rows.slice(1).filter((r) => r[0] !== "" && r[0] !== undefined).map((r) => ({
    id: Number(r[0]),
    name: r[1] ?? "",
    kind: (r[2] as Kind) || "supply",
    qty: Number(r[3] ?? 0),
    loc: r[4] ?? "",
    owner: r[5] ?? "",
    date: r[6] ?? "",
    exp: r[7] ? r[7] : undefined,
    min: Number(r[8] ?? 0),
    target: Number(r[9] ?? 1),
    noStock: (r[10] ?? "").toUpperCase() === "TRUE" ? true : undefined,
  }));
}

export function locsToRows(locs: Loc[]): string[][] {
  return [[...LOC_COLS], ...locs.map((l) => [l.code, l.name, l.room])];
}

export function rowsToLocs(rows: string[][]): Loc[] {
  return rows.slice(1).filter((r) => r[0]).map((r) => ({
    code: r[0], name: r[1] ?? "", room: r[2] ?? "",
    label: `${r[0]} · ${r[2] ?? ""} – ${r[1] ?? ""}`,
  }));
}

export function historyToRows(hist: Hist[]): string[][] {
  return hist.map((h) => [h.date, h.evt, h.name, cell(h.qty), cell(h.from), cell(h.to), h.who]);
}

export function rowsToHistory(rows: string[][]): Hist[] {
  return rows.slice(1).filter((r) => r[0]).map((r) => ({
    date: r[0], evt: r[1] as HistEvt, name: r[2] ?? "", qty: Number(r[3] ?? 0),
    from: r[4] || undefined, to: r[5] || undefined, who: r[6] ?? "",
  }));
}
```

If `HistEvt` / `Kind` are not yet exported from `src/data.ts`, add `export` to those type aliases (they already exist there).

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run api/_sheets.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add api/_sheets.ts api/_sheets.test.ts tsconfig.json package.json package-lock.json
git commit -m "feat: Sheet row<->object mappers"
```

---

## Task 4: SheetsClient + readState / writeSnapshot / ensureTabs

**Files:**
- Modify: `api/_sheets.ts` (add client + IO functions)
- Modify: `api/_sheets.test.ts` (add IO tests with a fake client)
- Create: `api/_fakeClient.ts` (shared in-memory `SheetsClient` for tests)
- Modify: `package.json` (dep `google-auth-library`)
- Modify: `src/data.ts` (export `SEED`)

**Interfaces:**
- Consumes: `GOOGLE_SERVICE_ACCOUNT_JSON`, `SHEET_ID` from `process.env`; mappers from Task 3; `SEED` from `src/data.ts`.
- Produces:
  ```ts
  export interface SheetsClient {
    batchGet(ranges: string[]): Promise<Record<string, string[][]>>; // key = tab name
    updateRange(range: string, values: string[][]): Promise<void>;
    clearRange(range: string): Promise<void>;
    append(range: string, values: string[][]): Promise<void>;
    listTabs(): Promise<string[]>;
    addTabs(names: string[]): Promise<void>;
  }
  export function realClient(): SheetsClient;               // JWT-backed, reads env
  export async function readState(c: SheetsClient): Promise<Snapshot>;
  export async function writeSnapshot(c: SheetsClient, prev: Snapshot, next: Snapshot): Promise<void>;
  export async function ensureSeeded(c: SheetsClient): Promise<{ created: boolean }>;
  ```
  `Snapshot` is imported from `src/mutations.ts`.
  `writeSnapshot` rewrites `items` and `locations` in full (clear A2:end then update) and appends only `next.history` rows that are not already in `prev.history` (compare by `date+evt+name`).

- [ ] **Step 1: Add `SEED` to `src/data.ts`**

Append:
```ts
import type { Loc } from "./data"; // (already in file scope; skip if self-referential)
export const SEED = {
  items: ITEMS.map((i) => ({ ...i })),
  locations: LOCS.map((l) => ({ ...l })),
  history: HIST.slice(),
};
```
(Place after the arrays are declared. No new import needed — `ITEMS`, `LOCS`, `HIST` are in the same file.)

- [ ] **Step 2: Add dep**

```bash
npm i google-auth-library@^9
```

- [ ] **Step 3a: Create the shared fake client**

```ts
// api/_fakeClient.ts — in-memory SheetsClient for tests
import type { SheetsClient } from "./_sheets";

export function fakeClient(
  initial: Record<string, string[][]> = {},
): SheetsClient & { tabs: Record<string, string[][]> } {
  const tabs: Record<string, string[][]> = JSON.parse(JSON.stringify(initial));
  return {
    tabs,
    async batchGet(ranges) {
      const out: Record<string, string[][]> = {};
      for (const r of ranges) out[r] = tabs[r] ?? [];
      return out;
    },
    async updateRange(range, values) { tabs[range.split("!")[0]] = values.map((r) => r.slice()); },
    async clearRange(range) { const t = range.split("!")[0]; tabs[t] = (tabs[t] ?? []).slice(0, 1); },
    async append(range, values) { const t = range.split("!")[0]; (tabs[t] ||= []).push(...values.map((r) => r.slice())); },
    async listTabs() { return Object.keys(tabs); },
    async addTabs(names) { for (const n of names) tabs[n] ||= []; },
  };
}
```

- [ ] **Step 3: Write the failing tests**

```ts
// append to api/_sheets.test.ts
import { readState, writeSnapshot, ensureSeeded } from "./_sheets";
import { fakeClient } from "./_fakeClient";
import { SEED } from "../src/data";

describe("readState / writeSnapshot", () => {
  it("ensureSeeded creates tabs and seeds when empty", async () => {
    const c = fakeClient();
    const r = await ensureSeeded(c);
    expect(r.created).toBe(true);
    const state = await readState(c);
    expect(state.items.length).toBe(SEED.items.length);
    expect(state.locations.length).toBe(SEED.locations.length);
  });

  it("ensureSeeded is idempotent", async () => {
    const c = fakeClient();
    await ensureSeeded(c);
    const r2 = await ensureSeeded(c);
    expect(r2.created).toBe(false);
    expect((await readState(c)).items.length).toBe(SEED.items.length);
  });

  it("writeSnapshot rewrites items/locations and appends only new history", async () => {
    const c = fakeClient();
    await ensureSeeded(c);
    const prev = await readState(c);
    const next = {
      ...prev,
      items: prev.items.map((i) => (i.name === "ทิชชู่" ? { ...i, qty: 0 } : i)),
      history: [{ date: "2026-09-06 09:12", evt: "USE" as const, name: "ทิชชู่", qty: 1, to: "BAT-01", who: "omo" }, ...prev.history],
    };
    await writeSnapshot(c, prev, next);
    const after = await readState(c);
    expect(after.items.find((i) => i.name === "ทิชชู่")!.qty).toBe(0);
    expect(after.history[0]).toMatchObject({ evt: "USE", name: "ทิชชู่" });
    expect(after.history.length).toBe(prev.history.length + 1);
  });
});
```

- [ ] **Step 4: Run to verify fail**

Run: `npx vitest run api/_sheets.test.ts`
Expected: FAIL — exports `readState` / `writeSnapshot` / `ensureSeeded` missing.

- [ ] **Step 5: Implement**

```ts
// add to api/_sheets.ts
import { JWT } from "google-auth-library";
import { SEED } from "../src/data";
import type { Snapshot } from "../src/mutations";

const TABS = ["items", "locations", "history"] as const;

export interface SheetsClient {
  batchGet(ranges: string[]): Promise<Record<string, string[][]>>;
  updateRange(range: string, values: string[][]): Promise<void>;
  clearRange(range: string): Promise<void>;
  append(range: string, values: string[][]): Promise<void>;
  listTabs(): Promise<string[]>;
  addTabs(names: string[]): Promise<void>;
}

export function realClient(): SheetsClient {
  const key = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON as string);
  const id = process.env.SHEET_ID as string;
  const jwt = new JWT({
    email: key.client_email,
    key: (key.private_key as string).replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${id}`;
  const call = async (url: string, init?: RequestInit) => {
    const { token } = await jwt.getAccessToken();
    const res = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    if (!res.ok) throw new Error(`Sheets ${res.status}: ${await res.text()}`);
    return res.json();
  };
  return {
    async batchGet(ranges) {
      const qs = ranges.map((r) => `ranges=${encodeURIComponent(r)}`).join("&");
      const j = await call(`${base}/values:batchGet?${qs}&majorDimension=ROWS`);
      const out: Record<string, string[][]> = {};
      (j.valueRanges ?? []).forEach((vr: { range: string; values?: string[][] }, i: number) => {
        out[ranges[i]] = vr.values ?? [];
      });
      return out;
    },
    async updateRange(range, values) {
      await call(`${base}/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
        method: "PUT", body: JSON.stringify({ values }),
      });
    },
    async clearRange(range) {
      await call(`${base}/values/${encodeURIComponent(range)}:clear`, { method: "POST", body: "{}" });
    },
    async append(range, values) {
      await call(`${base}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
        method: "POST", body: JSON.stringify({ values }),
      });
    },
    async listTabs() {
      const j = await call(`${base}?fields=sheets.properties.title`);
      return (j.sheets ?? []).map((s: { properties: { title: string } }) => s.properties.title);
    },
    async addTabs(names) {
      await call(`${base}:batchUpdate`, {
        method: "POST",
        body: JSON.stringify({ requests: names.map((title) => ({ addSheet: { properties: { title } } })) }),
      });
    },
  };
}

export async function readState(c: SheetsClient): Promise<Snapshot> {
  const g = await c.batchGet([...TABS]);
  return {
    items: rowsToItems(g.items ?? []),
    locations: rowsToLocs(g.locations ?? []),
    history: rowsToHistory(g.history ?? []),
  };
}

const histKey = (h: { date: string; evt: string; name: string }) => `${h.date}|${h.evt}|${h.name}`;

export async function writeSnapshot(c: SheetsClient, prev: Snapshot, next: Snapshot): Promise<void> {
  await c.clearRange("items!A2:K");
  await c.updateRange("items!A1", itemsToRows(next.items));
  await c.clearRange("locations!A2:C");
  await c.updateRange("locations!A1", locsToRows(next.locations));
  const known = new Set(prev.history.map(histKey));
  const fresh = next.history.filter((h) => !known.has(histKey(h)));
  if (fresh.length) await c.append("history!A1", historyToRows(fresh));
}

export async function ensureSeeded(c: SheetsClient): Promise<{ created: boolean }> {
  const existing = await c.listTabs();
  const missing = TABS.filter((t) => !existing.includes(t));
  if (missing.length) await c.addTabs(missing);
  const g = await c.batchGet([...TABS]);
  const empty = (g.items ?? []).length === 0;
  if (!empty) return { created: false };
  await c.updateRange("items!A1", itemsToRows(SEED.items));
  await c.updateRange("locations!A1", locsToRows(SEED.locations));
  await c.updateRange("history!A1", [[...HIST_COLS], ...historyToRows(SEED.history)]);
  return { created: true };
}
```

- [ ] **Step 6: Run to verify pass**

Run: `npx vitest run api/_sheets.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 7: Full suite + typecheck**

Run: `npx vitest run && npx tsc -b`
Expected: green.

- [ ] **Step 8: Commit**

```bash
git add api/_sheets.ts api/_sheets.test.ts api/_fakeClient.ts src/data.ts package.json package-lock.json
git commit -m "feat: Sheets client, readState/writeSnapshot/ensureSeeded"
```

---

## Task 5: runMutation + API handlers + vercel.json

**Files:**
- Create: `api/_run.ts`, `api/_run.test.ts`
- Create: `api/state.ts`, `api/mutate.ts`, `api/init.ts`
- Create: `vercel.json`
- Modify: `package.json` (devDep `@vercel/node`, script `vercel-dev`)

**Interfaces:**
- Consumes: `SheetsClient`, `realClient`, `readState`, `writeSnapshot`, `ensureSeeded` from `api/_sheets.ts`; `fakeClient` from `api/_fakeClient.ts`; `applyMutation`, `Msg`, `Snapshot` from `src/mutations.ts`.
- Produces:
  ```ts
  // api/_run.ts
  export async function runMutation(
    c: SheetsClient, msg: Msg, owner: string,
  ): Promise<{ snapshot: Snapshot; result: Record<string, unknown> } | { error: string }>;
  ```
  HTTP contract (consumed by Task 6 client):
  - `GET /api/state` → `200 { items, locations, history }`
  - `POST /api/mutate` body `{ type, owner, ...payload }` → `200 { items, locations, history, result }` | `400 { error }`
  - `POST /api/init` → `200 { created: boolean }`
  - any thrown error → `500 { error: string }`

- [ ] **Step 1: Add deps + script**

```bash
npm i -D @vercel/node@^3
```
`package.json` scripts: add `"vercel-dev": "vercel dev --listen 5273"`.

- [ ] **Step 2: Write the failing test**

```ts
// api/_run.test.ts
import { describe, expect, it } from "vitest";
import { ensureSeeded, readState } from "./_sheets";
import { fakeClient } from "./_fakeClient";
import { runMutation } from "./_run";

describe("runMutation", () => {
  it("USE persists to the fake sheet and returns result", async () => {
    const c = fakeClient();
    await ensureSeeded(c);
    const tissue = (await readState(c)).items.find((i) => i.name === "ทิชชู่")!;
    const r = await runMutation(c, { type: "use", useId: tissue.id, useQty: 1 } as any, "omo");
    if ("error" in r) throw new Error(r.error);
    expect(r.result).toMatchObject({ left: 0, name: "ทิชชู่" });
    expect((await readState(c)).items.find((i) => i.name === "ทิชชู่")!.qty).toBe(0);
    expect((await readState(c)).history[0]).toMatchObject({ evt: "USE", name: "ทิชชู่" });
  });

  it("returns { error } for an invalid mutation and does not write", async () => {
    const c = fakeClient();
    await ensureSeeded(c);
    const before = await readState(c);
    const r = await runMutation(c, { type: "newItem", name: "สบู่", kind: "supply" } as any, "omo");
    expect(r).toEqual({ error: expect.any(String) });
    expect((await readState(c)).items.length).toBe(before.items.length);
  });
});
```

- [ ] **Step 3: Run to verify fail**

Run: `npx vitest run api/_run.test.ts`
Expected: FAIL — `Cannot find module './_run'`.

- [ ] **Step 4: Implement `api/_run.ts`**

```ts
import { applyMutation, type Msg, type Snapshot } from "../src/mutations";
import { readState, writeSnapshot, type SheetsClient } from "./_sheets";

export async function runMutation(
  c: SheetsClient,
  msg: Msg,
  owner: string,
): Promise<{ snapshot: Snapshot; result: Record<string, unknown> } | { error: string }> {
  const current = await readState(c);
  const res = applyMutation(current, msg, owner);
  if ("error" in res) return res;
  await writeSnapshot(c, current, res.snapshot);
  return res;
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run api/_run.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Implement the HTTP handlers**

```ts
// api/state.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { readState, realClient } from "./_sheets";

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    res.status(200).json(await readState(realClient()));
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
}
```

```ts
// api/mutate.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { Msg } from "../src/mutations";
import { realClient } from "./_sheets";
import { runMutation } from "./_run";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const body = (typeof req.body === "string" ? JSON.parse(req.body) : req.body) ?? {};
    const { owner, ...msg } = body as { owner?: string } & Msg;
    if (!owner || !msg.type) return res.status(400).json({ error: "owner and type required" });
    const r = await runMutation(realClient(), msg as Msg, owner);
    if ("error" in r) return res.status(400).json(r);
    res.status(200).json({ ...r.snapshot, result: r.result });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
}
```

```ts
// api/init.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { ensureSeeded, realClient } from "./_sheets";

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    res.status(200).json(await ensureSeeded(realClient()));
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
}
```

```json
// vercel.json
{ "framework": "vite" }
```

- [ ] **Step 7: Typecheck + full suite + build**

Run: `npx tsc -b && npx vitest run && npx vite build`
Expected: green. (`@vercel/node` types resolve; `api/*` compiles.)

- [ ] **Step 8: Commit**

```bash
git add api/_run.ts api/_run.test.ts api/state.ts api/mutate.ts api/init.ts vercel.json package.json package-lock.json
git commit -m "feat: /api state, mutate, init handlers"
```

---

## Task 6: Client wiring — fetch on load, network mutations, offline fallback

**Files:**
- Create: `src/api.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: HTTP contract from Task 5; `Snapshot`, `Msg` from `src/mutations.ts`.
- Produces:
  ```ts
  // src/api.ts
  export async function fetchState(): Promise<Snapshot>;
  export async function mutate(msg: Msg, owner: string): Promise<{ snapshot: Snapshot; result: Record<string, unknown> }>;
  // throws Error on non-2xx or network failure; mutate throws Error(body.error) on 400
  ```

- [ ] **Step 1: Implement `src/api.ts`**

```ts
import type { Msg, Snapshot } from "./mutations";

async function j<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  return body as T;
}

export async function fetchState(): Promise<Snapshot> {
  return j<Snapshot>(await fetch("/api/state"));
}

export async function mutate(
  msg: Msg,
  owner: string,
): Promise<{ snapshot: Snapshot; result: Record<string, unknown> }> {
  const body = await j<Snapshot & { result: Record<string, unknown> }>(
    await fetch("/api/mutate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...msg, owner }),
    }),
  );
  const { result, ...snapshot } = body;
  return { snapshot, result };
}
```

- [ ] **Step 2: Add load + sync state to `App.tsx`**

Add to `State`: `loading: boolean`, `online: boolean`. Init `loading: true, online: true`.

After `dispatch` is defined, add:
```ts
useEffect(() => {
  let cancelled = false;
  fetchState()
    .then((snap) => { if (!cancelled) set({ items: snap.items, locs: snap.locations, hist: snap.history, loading: false }); })
    .catch(() => { if (!cancelled) { set({ loading: false, online: false }); flash("ออฟไลน์ · ใช้ข้อมูลตัวอย่าง"); } });
  return () => { cancelled = true; };
}, []); // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 3: Make `dispatch` write-through to the server**

Replace the `dispatch` helper from Task 2 with:
```ts
const dispatch = (msg: Msg, toastFor?: (r: Record<string, unknown>) => string) => {
  const prev: Snapshot = { items: s.items, locations: s.locs, history: s.hist };
  const local = applyMutation(prev, msg, s.owner);
  if ("error" in local) { flash(local.error); return false; }
  set({ items: local.snapshot.items, locs: local.snapshot.locations, hist: local.snapshot.history });
  if (toastFor) flash(toastFor(local.result));
  if (s.online) {
    mutate(msg, s.owner)
      .then(({ snapshot }) => set({ items: snapshot.items, locs: snapshot.locations, hist: snapshot.history }))
      .catch((e) => {
        set({ items: prev.items, locs: prev.locations, hist: prev.history });
        flash(`บันทึกไม่สำเร็จ · ${(e as Error).message}`);
      });
  }
  return true;
};
```
`moveSave` / `useSave` (which read `res.result` for navigation) keep their explicit `applyMutation` call for the optimistic update and screen change, then fire `mutate(...)` the same way with rollback on catch. Show the exact code:
```ts
const moveSave = () => {
  const prev: Snapshot = { items: s.items, locations: s.locs, history: s.hist };
  const res = applyMutation(prev, { type: "move", moveRows: s.moveRows.map((r) => ({ itemId: r.itemId, qty: r.qty, to: r.to })) }, s.owner);
  if ("error" in res) return flash(res.error);
  set({ items: res.snapshot.items, locs: res.snapshot.locations, hist: res.snapshot.history,
        screen: "inv", invMode: "loc", invLoc: (res.result.firstTo as string) ?? null, moveRows: [freshMoveRow()] });
  flash(`ย้าย ${res.result.moved} รายการ โดย ${s.owner}`);
  if (s.online) mutate({ type: "move", moveRows: s.moveRows.map((r) => ({ itemId: r.itemId, qty: r.qty, to: r.to })) }, s.owner)
    .then(({ snapshot }) => set({ items: snapshot.items, locs: snapshot.locations, hist: snapshot.history }))
    .catch((e) => { set({ items: prev.items, locs: prev.locations, hist: prev.history }); flash(`บันทึกไม่สำเร็จ · ${(e as Error).message}`); });
};
```
Apply the same shape to `useSave` and `addSave`.

- [ ] **Step 4: Loading UI**

In the render, when `s.loading`, replace the scroll-area children with a centered clay spinner:
```tsx
{s.loading ? (
  <div style={st("display:grid;place-items:center;height:60vh")}>
    <div style={st("width:34px;height:34px;border-radius:50%;border:3px solid #C6B9E6;border-top-color:#6A57D6;animation:spin .8s linear infinite")} />
  </div>
) : ( /* existing screen switch */ )}
```
Add to `index.html` `<style>`: `@keyframes spin{to{transform:rotate(360deg)}}`.

- [ ] **Step 5: Debounce settings steppers**

Add a `useRef<Record<number, ReturnType<typeof setTimeout>>>({})` keyed by item id. In the item `patch` handler, update local state immediately (optimistic) but debounce the `mutate({ type: "setItemField", ... })` call by 600 ms per id. Show code:
```ts
const fieldTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
const debouncedField = (id: number, patch: { min?: number; target?: number }) => {
  // optimistic local
  set({ items: s.items.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  clearTimeout(fieldTimers.current[id]);
  fieldTimers.current[id] = setTimeout(() => {
    if (s.online) mutate({ type: "setItemField", id, ...patch }, s.owner)
      .then(({ snapshot }) => set({ items: snapshot.items, locs: snapshot.locations, hist: snapshot.history }))
      .catch((e) => flash(`บันทึกไม่สำเร็จ · ${(e as Error).message}`));
  }, 600);
};
```
Wire the MIN/TARGET `inc`/`dec` in `build()` to `debouncedField`. `toggleTrack` and place edits use plain `dispatch` (no debounce needed).

- [ ] **Step 6: Manual test (offline path)**

Run: `npm run dev` (plain Vite, no `/api`).
Expected: brief spinner → "ออฟไลน์ · ใช้ข้อมูลตัวอย่าง" toast → seed data visible → all screens work, mutations apply locally.

- [ ] **Step 7: Typecheck + build + tests**

Run: `npx tsc -b && npx vite build && npx vitest run`
Expected: green.

- [ ] **Step 8: Commit**

```bash
git add src/api.ts src/App.tsx index.html
git commit -m "feat: client fetch-on-load + optimistic write-through to /api"
```

---

## Task 7: GitHub repo + push

**Files:** none (git/gh operations)

- [ ] **Step 1: Confirm gh auth**

Run: `gh auth status`
Expected: logged in. If not, stop and ask the user to run `gh auth login`.

- [ ] **Step 2: Create the repo and push**

Ask the user: **public or private?** Then:
```bash
gh repo create maebaan-home-inventory --private --source=. --remote=origin --push
```
(swap `--private` for `--public` per the answer.)

- [ ] **Step 3: Verify**

Run: `gh repo view --web` (or `git remote -v`)
Expected: repo exists, `master` pushed.

- [ ] **Step 4: Commit** — nothing to commit; note the repo URL for Task 8.

---

## Task 8: Google Sheet + service account (Chrome MCP + user)

**Files:** none

- [ ] **Step 1: Create the Sheet (Chrome MCP)**

Navigate Chrome to `https://sheets.new`. Rename the spreadsheet to `Maebaan Inventory DB`. Copy the spreadsheet ID from the URL (`/spreadsheets/d/<ID>/edit`). Record it.

- [ ] **Step 2: GCP project + Sheets API (Chrome MCP navigates, user clicks consent)**

Navigate to `https://console.cloud.google.com/projectcreate`. Fill project name `maebaan`. **User clicks "Create"** and any terms dialog.
Navigate to `https://console.cloud.google.com/apis/library/sheets.googleapis.com`, select the `maebaan` project, **user clicks "Enable"**.

- [ ] **Step 3: Service account + key (Chrome MCP navigates, user does the key)**

Navigate to `https://console.cloud.google.com/iam-admin/serviceaccounts/create`. Fill name `maebaan-sheets`. **User clicks "Create and continue"**, skips role, **"Done"**.
Open the service account → **Keys → Add key → Create new key → JSON**. **User confirms; the JSON downloads to their machine.** Claude never reads this file.
Record the service-account email (`maebaan-sheets@maebaan-<n>.iam.gserviceaccount.com`).

- [ ] **Step 4: Share the Sheet (Chrome MCP)**

Back in the Sheet → Share → paste the service-account email → role **Editor** → send/save (uncheck "notify").

---

## Task 9: Vercel project, env, deploy, verify

**Files:** none (Vercel MCP + Chrome MCP + user)

- [ ] **Step 1: Find the Vercel team**

Use Vercel MCP `list_teams`. Record `teamId`.

- [ ] **Step 2: Create the linked project**

Vercel MCP `create_git_project` with `repo: "<owner>/maebaan-home-inventory"`, `teamId`. This links the repo and starts a preview deploy. Record the project name/URL.

- [ ] **Step 3: Set env vars (Chrome MCP navigates, user pastes)**

Navigate Chrome to the project's **Settings → Environment Variables** page. For each of Production + Preview:
- `SHEET_ID` = the ID from Task 8 Step 1 — Claude can type this.
- `GOOGLE_SERVICE_ACCOUNT_JSON` = **user pastes** the full contents of the downloaded JSON key file, then clicks **Save**.

- [ ] **Step 4: Redeploy to pick up env**

Vercel MCP: trigger a new deployment of the production branch (`create_git_project` again is a no-op link + redeploy, or use the dashboard "Redeploy"). Wait for it to finish (`get_deployment` / build logs).

- [ ] **Step 5: Seed the Sheet**

`curl -X POST https://<preview-or-prod-url>/api/init`
Expected: `{"created":true}` on first run, `{"created":false}` after. Open the Sheet — 3 tabs with headers + seed rows.

- [ ] **Step 6: Smoke test the preview URL**

Open the preview URL in Chrome. Confirm:
- App loads real data (no "ออฟไลน์" toast).
- ADD an item → appears; check the Sheet `items` + `history` tabs updated.
- USE it → qty drops in the Sheet.
- Reload the app → the change persisted.

- [ ] **Step 7: Promote to production (user approves)**

Ask the user to confirm going live. Then Vercel MCP `deploy_to_vercel` is not needed — promote the passing preview to production via the dashboard "Promote" or push a trivial commit to `master` (auto-deploys production). Confirm the production URL serves the app and `/api/state` returns data.

- [ ] **Step 8: Final commit + README update**

Update `README.md` with the production URL, the env-var list, and `npx vercel dev` as the local command. Commit:
```bash
git add README.md
git commit -m "docs: deployed on Vercel with Sheets backend"
git push
```

---

## Self-Review

**Spec coverage:**
- Architecture / request flow → Tasks 1, 4, 5.
- Mutation types table → Task 1 (all 10 + add/move/use).
- `bought` client-only → Task 1 note + Task 6 (not in Snapshot); `shopRows` still reads `s.bought` in `App.tsx`, unchanged.
- `GET /api/state`, `POST /api/mutate`, `POST /api/init` → Task 5.
- Sheet schema / column keys → Task 3 (`ITEM_COLS` etc., verbatim).
- Google auth, `\n` fix, server-only key → Task 4 `realClient`, Global Constraints.
- Repo layout → Tasks 3–5.
- Client changes (mount fetch, optimistic, offline toast, debounce) → Task 6.
- Local dev (`vercel dev` + plain Vite fallback) → Task 5 script, Task 6 Step 6.
- Testing (logic, mappers, mutate handler, manual smoke) → Tasks 1, 3, 4, 5, 9.
- Setup runbook (Claude vs user split) → Tasks 7, 8, 9 with explicit "user clicks" steps.
- Risks (no env tool, GCP UI drift, `\n`, cold start, idempotent init) → Global Constraints + Task 9 Step 3 + Task 4.

No gaps found.

**Placeholder scan:** no TBD/TODO; every code step has full code; no "similar to Task N" (move/use code repeated in full in Task 6).

**Type consistency:** `Snapshot` = `{ items, locations, history }` everywhere on the wire; `App.tsx` `State` keeps `locs`/`hist` and converts at the `dispatch`/`fetchState` boundary (called out in Tasks 2 and 6). `applyMutation(snap, msg, owner)` signature identical in Tasks 1, 5, 6. `Msg` union identical. `SheetsClient` methods (`batchGet`, `updateRange`, `clearRange`, `append`, `listTabs`, `addTabs`) identical in Tasks 3, 4, 5 fakes.
