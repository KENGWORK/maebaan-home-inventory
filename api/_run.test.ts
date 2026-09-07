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

  // C1 — no content-based dedup: two identical mutations are two audit rows
  it("two identical mutations both land in history", async () => {
    const c = fakeClient();
    await ensureSeeded(c);
    const soap = (await readState(c)).items.find((i) => i.name === "สบู่")!;
    const base = (await readState(c)).history.length;
    await runMutation(c, { type: "use", useId: soap.id, useQty: 1 } as any, "omo");
    await runMutation(c, { type: "use", useId: soap.id, useQty: 1 } as any, "omo");
    expect((await readState(c)).history.length).toBe(base + 2);
  });

  // C2 — history order is stable across a sheet round-trip (app model = newest first)
  it("newest history row is first after a round-trip", async () => {
    const c = fakeClient();
    await ensureSeeded(c);
    const tissue = (await readState(c)).items.find((i) => i.name === "ทิชชู่")!;
    await runMutation(c, { type: "use", useId: tissue.id, useQty: 1 } as any, "เก่ง");
    const h0 = (await readState(c)).history[0];
    expect(h0).toMatchObject({ evt: "USE", name: "ทิชชู่", who: "เก่ง" });
    // and it is genuinely the new row, not SEED.history[0] (which is who:"omo")
    expect(h0.who).toBe("เก่ง");
  });

  // I2 — a rejected mutation must not touch the sheet at all
  it("a rejected mutation writes nothing", async () => {
    const c = fakeClient();
    await ensureSeeded(c);
    const before = JSON.stringify(c.tabs);
    const r = await runMutation(c, { type: "newItem", name: "สบู่", kind: "supply" } as any, "omo");
    expect(r).toEqual({ error: expect.any(String) });
    expect(JSON.stringify(c.tabs)).toBe(before);
  });
});
