import { describe, expect, it } from "vitest";
import { freshItems, freshLocs } from "../src/logic";
import {
  historyToRows, itemsToRows, locsToRows, rowsToHistory, rowsToItems, rowsToLocs,
} from "./_sheets";
import { readState, writeSnapshot, ensureSeeded } from "./_sheets";
import { fakeClient } from "./_fakeClient";
import { SEED } from "../src/data";

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
