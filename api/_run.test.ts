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
