import { describe, expect, it } from "vitest";
import { TODAY } from "./data";
import {
  applyAdd,
  applyMove,
  applyUse,
  autoCode,
  days,
  freshHist,
  freshItems,
  freshLocs,
  homeDerived,
  locLabel,
  locSug,
  shopRows,
} from "./logic";

describe("days", () => {
  it("counts whole days to EXP against pinned today", () => {
    expect(days("2026-09-07", TODAY)).toBe(1);
    expect(days("2026-09-06", TODAY)).toBe(0);
    expect(days("2026-09-01", TODAY)).toBe(-5);
  });
  it("returns null when no EXP", () => {
    expect(days(null)).toBeNull();
    expect(days(undefined)).toBeNull();
  });
});

describe("locLabel", () => {
  it("formats room – name, and — for unknown", () => {
    expect(locLabel(freshLocs(), "KIT-03")).toBe("ห้องครัว – ตู้กับข้าว");
    expect(locLabel(freshLocs(), "NOPE")).toBe("—");
  });
});

describe("autoCode", () => {
  it("continues the run for an existing room", () => {
    expect(autoCode(freshLocs(), "ห้องครัว")).toBe("KIT-04");
    expect(autoCode(freshLocs(), "ห้องน้ำ")).toBe("BAT-02");
  });
  it("maps a known but unused room to its prefix", () => {
    expect(autoCode(freshLocs(), "ห้องทำงาน")).toBe("OFF-01");
  });
  it("derives a prefix from latin letters otherwise", () => {
    expect(autoCode(freshLocs(), "Studio")).toBe("STU-01");
  });
});

describe("locSug", () => {
  it("matches on name / room / code and caps at 5", () => {
    const hits = locSug(freshLocs(), "ครัว", "");
    expect(hits.length).toBe(3);
    expect(hits.every((l) => l.room === "ห้องครัว")).toBe(true);
  });
  it("is empty for blank query or the single already-picked loc", () => {
    expect(locSug(freshLocs(), "", "")).toEqual([]);
    expect(locSug(freshLocs(), "KIT-03", "KIT-03")).toEqual([]);
  });
});

describe("homeDerived", () => {
  it("summarises the seed inventory", () => {
    const d = homeDerived(freshItems(), TODAY);
    // น้ำปลา (EXP 2026-09-07, qty 1) and ยาลดไข้ (EXP 2026-09-09, qty 8) are within 3 days
    expect(d.expiring.map((i) => i.name).sort()).toEqual(["น้ำปลา", "ยาลดไข้"]);
    // ยาแก้ท้องเสีย has qty 0 and is stock-tracked
    expect(d.out.map((i) => i.name)).toEqual(["ยาแก้ท้องเสีย"]);
    // every stock-tracked item at or below its min: ทิชชู่ 1/2, น้ำปลา 1/1, น้ำยาซักผ้า 1/1, สบู่ 2/3
    expect(d.low.map((i) => i.name).sort()).toEqual(["ทิชชู่", "น้ำปลา", "น้ำยาซักผ้า", "สบู่"]);
    expect(d.totalQty).toBe(22);
    expect(d.ready).toBeGreaterThanOrEqual(0);
    expect(d.ready).toBeLessThanOrEqual(100);
  });
});

describe("shopRows", () => {
  it("lists out + low tracked items and honours the bought override", () => {
    const rows = shopRows(freshItems(), []);
    const byName = Object.fromEntries(rows.map((r) => [r.name, r.group]));
    expect(byName["ยาแก้ท้องเสีย"]).toBe("out");
    expect(byName["สบู่"]).toBe("low");
    expect(byName["หูฟัง nubwo"]).toBeUndefined(); // noStock

    const rows2 = shopRows(freshItems(), ["สบู่"]);
    expect(rows2.find((r) => r.name === "สบู่")?.group).toBe("bought");
  });
});

describe("applyAdd", () => {
  it("rejects rows with no name or location", () => {
    const r = applyAdd(freshItems(), freshHist(), [
      { name: "", kind: "supply", qty: 1, loc: "", expMode: "days", expVal: "" },
    ], "เก่ง");
    expect(r).toEqual({ error: expect.any(String) });
  });

  it("merges into an existing name+loc and logs ADD", () => {
    const res = applyAdd(
      freshItems(),
      freshHist(),
      [{ name: "สบู่", kind: "supply", qty: 3, loc: "BAT-01", expMode: "days", expVal: "" }],
      "omo",
    );
    if ("error" in res) throw new Error(res.error);
    expect(res.added).toBe(1);
    const soap = res.items.find((i) => i.name === "สบู่" && i.loc === "BAT-01")!;
    expect(soap.qty).toBe(5);
    expect(res.hist[0]).toMatchObject({ evt: "ADD", name: "สบู่", qty: 3, who: "omo" });
  });

  it("creates a new item and resolves EXP days -> ISO date", () => {
    const res = applyAdd(
      freshItems(),
      freshHist(),
      [{ name: "โยเกิร์ต", kind: "food", qty: 2, loc: "KIT-01", expMode: "days", expVal: "7" }],
      "เก่ง",
      TODAY, // pin "today" so the resolved EXP date is deterministic
    );
    if ("error" in res) throw new Error(res.error);
    const y = res.items.find((i) => i.name === "โยเกิร์ต")!;
    expect(y.exp).toBe("2026-09-13");
    expect(y.qty).toBe(2);
  });
});

describe("applyMove", () => {
  it("moves qty between locations, capping at source stock", () => {
    const items = freshItems();
    const feverMed = items.find((i) => i.name === "ยาลดไข้")!; // qty 8 @ MAS-02
    const res = applyMove(items, freshHist(), [{ itemId: feverMed.id, qty: 100, to: "KIT-02" }], "เก่ง");
    if ("error" in res) throw new Error(res.error);
    expect(res.items.find((i) => i.id === feverMed.id)?.qty).toBe(0);
    expect(res.items.find((i) => i.name === "ยาลดไข้" && i.loc === "KIT-02")?.qty).toBe(8);
    expect(res.hist[0]).toMatchObject({ evt: "MOVE", from: "MAS-02", to: "KIT-02", qty: 8 });
  });

  it("rejects when nothing is picked", () => {
    const res = applyMove(freshItems(), freshHist(), [{ itemId: null, qty: 1, to: "KIT-01" }], "เก่ง");
    expect(res).toEqual({ error: expect.any(String) });
  });
});

describe("id assignment (I6)", () => {
  it("applyAdd gives a new item max(existing id) + 1, stable across identical calls", () => {
    const maxId = Math.max(...freshItems().map((i) => i.id));
    const run = () =>
      applyAdd(
        freshItems(),
        freshHist(),
        [{ name: "โยเกิร์ต", kind: "food", qty: 2, loc: "KIT-01", expMode: "days", expVal: "7" }],
        "เก่ง",
      );
    const a = run();
    const b = run();
    if ("error" in a || "error" in b) throw new Error("unexpected error");
    expect(a.items.find((i) => i.name === "โยเกิร์ต")!.id).toBe(maxId + 1);
    expect(b.items.find((i) => i.name === "โยเกิร์ต")!.id).toBe(maxId + 1);
  });

  it("applyAdd numbers several new items consecutively", () => {
    const maxId = Math.max(...freshItems().map((i) => i.id));
    const res = applyAdd(
      freshItems(),
      freshHist(),
      [
        { name: "โยเกิร์ต", kind: "food", qty: 1, loc: "KIT-01", expMode: "days", expVal: "" },
        { name: "ถ่าน AA", kind: "supply", qty: 1, loc: "KIT-01", expMode: "days", expVal: "" },
      ],
      "เก่ง",
    );
    if ("error" in res) throw new Error(res.error);
    expect(res.items.find((i) => i.name === "โยเกิร์ต")!.id).toBe(maxId + 1);
    expect(res.items.find((i) => i.name === "ถ่าน AA")!.id).toBe(maxId + 2);
  });

  it("applyMove gives the new destination row max(existing id) + 1", () => {
    const items = freshItems();
    const maxId = Math.max(...items.map((i) => i.id));
    const fever = items.find((i) => i.name === "ยาลดไข้")!;
    const res = applyMove(items, freshHist(), [{ itemId: fever.id, qty: 3, to: "KIT-02" }], "เก่ง");
    if ("error" in res) throw new Error(res.error);
    expect(res.items.find((i) => i.name === "ยาลดไข้" && i.loc === "KIT-02")!.id).toBe(maxId + 1);
  });
});

describe("applyUse", () => {
  it("decrements stock and reports what is left", () => {
    const items = freshItems();
    const tissue = items.find((i) => i.name === "ทิชชู่")!; // qty 1
    const res = applyUse(items, freshHist(), tissue.id, 5, "omo");
    if ("error" in res) throw new Error(res.error);
    expect(res.left).toBe(0);
    expect(res.items.find((i) => i.id === tissue.id)?.qty).toBe(0);
    expect(res.hist[0]).toMatchObject({ evt: "USE", name: "ทิชชู่", qty: 1 });
  });

  it("rejects when no item id", () => {
    expect(applyUse(freshItems(), freshHist(), null, 1, "omo")).toEqual({ error: expect.any(String) });
  });
});
