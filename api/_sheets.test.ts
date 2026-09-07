import { describe, expect, it } from "vitest";
import { freshItems, freshLocs } from "../src/logic.js";
import {
  historyToRows, itemsToRows, locsToRows, rowsToHistory, rowsToItems, rowsToLocs,
} from "./_sheets.js";
import { readState, writeSnapshot, ensureSeeded } from "./_sheets.js";
import { HIST_COLS, ITEM_COLS, LOC_COLS } from "./_sheets.js";
import { fakeClient } from "./_fakeClient.js";
import { SEED } from "../src/data.js";

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

  // Fix 4 — header-only tabs are "empty" and get seeded
  it("ensureSeeded seeds a tab that holds exactly the expected header and no data", async () => {
    const c = fakeClient({
      items: [[...ITEM_COLS]],
      locations: [[...LOC_COLS]],
      history: [[...HIST_COLS]],
    });
    const r = await ensureSeeded(c);
    expect(r.created).toBe(true);
    expect((await readState(c)).items.length).toBe(SEED.items.length);
  });

  // Fix 4 — a tab with unrecognised content is left strictly alone
  it("ensureSeeded never rewrites a header or seeds over a non-header first row", async () => {
    const junk = [["ไม่ใช่หัวตาราง", "ข้อมูลมือ"]];
    const c = fakeClient({ items: junk, locations: [[...LOC_COLS]], history: [[...HIST_COLS]] });
    const r = await ensureSeeded(c);
    expect(r.created).toBe(false);
    // untouched: no header written over the row, no seed rows appended
    expect(c.tabs.items).toEqual(junk);
  });

  it("ensureSeeded leaves a populated items tab with a bad header untouched", async () => {
    const c = fakeClient();
    await ensureSeeded(c);
    const before = JSON.parse(JSON.stringify(c.tabs.items));
    c.tabs.items[0] = ["oops", "wrong", "header"];
    const r = await ensureSeeded(c);
    expect(r.created).toBe(false);
    expect(c.tabs.items[0]).toEqual(["oops", "wrong", "header"]);
    expect(c.tabs.items.length).toBe(before.length);
  });

  it("writeSnapshot rewrites items/locations, clears the surplus tail and appends the given history", async () => {
    const c = fakeClient();
    await ensureSeeded(c);
    const prev = await readState(c);
    const next = {
      ...prev,
      // one FEWER item -> the trailing row must be cleared, not left behind
      items: prev.items
        .filter((i) => i.name !== "powerbank")
        .map((i) => (i.name === "ทิชชู่" ? { ...i, qty: 0 } : i)),
      locations: prev.locations.filter((l) => l.code !== "GAR-02"),
    };
    const appended = [
      { date: "2026-09-06 09:12", evt: "USE" as const, name: "ทิชชู่", qty: 1, to: "BAT-01", who: "omo" },
    ];
    await writeSnapshot(c, next, appended);
    const after = await readState(c);
    expect(after.items.length).toBe(prev.items.length - 1);
    expect(after.items.some((i) => i.name === "powerbank")).toBe(false);
    expect(after.locations.length).toBe(prev.locations.length - 1);
    expect(after.items.find((i) => i.name === "ทิชชู่")!.qty).toBe(0);
    expect(after.history[0]).toMatchObject({ evt: "USE", name: "ทิชชู่" });
    expect(after.history.length).toBe(prev.history.length + 1);
  });

  it("writeSnapshot appends duplicate history rows verbatim (no content dedup)", async () => {
    const c = fakeClient();
    await ensureSeeded(c);
    const prev = await readState(c);
    const row = { date: "2026-09-06 09:12", evt: "USE" as const, name: "ทิชชู่", qty: 1, to: "BAT-01", who: "omo" };
    await writeSnapshot(c, prev, [row]);
    await writeSnapshot(c, prev, [row]);
    expect((await readState(c)).history.length).toBe(prev.history.length + 2);
  });
});
