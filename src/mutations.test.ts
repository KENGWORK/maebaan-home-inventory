import { describe, expect, it } from "vitest";
import { applyMutation, type Msg, type Snapshot } from "./mutations";
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

  // I6 — deterministic ids
  it("newItem: id is max(existing) + 1 and is stable across identical calls", () => {
    const maxId = Math.max(...snap().items.map((i) => i.id));
    const a = applyMutation(snap(), { type: "newItem", name: "ถ่าน AA", kind: "supply" }, "เก่ง");
    const b = applyMutation(snap(), { type: "newItem", name: "ถ่าน AA", kind: "supply" }, "เก่ง");
    if ("error" in a || "error" in b) throw new Error("unexpected error");
    expect(a.snapshot.items.find((i) => i.name === "ถ่าน AA")!.id).toBe(maxId + 1);
    expect(b.snapshot.items.find((i) => i.name === "ถ่าน AA")!.id).toBe(maxId + 1);
  });

  // I6 — missing id is an error, not a silent no-op
  it("delItem / setItemField: unknown id -> { error }", () => {
    expect(applyMutation(snap(), { type: "delItem", id: 999999 }, "เก่ง")).toEqual({ error: expect.any(String) });
    expect(applyMutation(snap(), { type: "setItemField", id: 999999, min: 3 }, "เก่ง")).toEqual({ error: expect.any(String) });
  });

  // C4 — a blank place code must be rejected
  it("setPlaceCode: rejects a blank new code", () => {
    expect(applyMutation(snap(), { type: "setPlaceCode", code: "KIT-01", newCode: "  " }, "เก่ง"))
      .toEqual({ error: expect.any(String) });
  });

  // I3 — unknown mutation type is a validation error, not a crash
  it("unknown mutation type -> { error }", () => {
    expect(applyMutation(snap(), { type: "bogus" } as unknown as Msg, "เก่ง"))
      .toEqual({ error: expect.any(String) });
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
