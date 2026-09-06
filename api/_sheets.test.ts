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
