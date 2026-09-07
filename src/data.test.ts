import { describe, expect, it } from "vitest";
import { localDateISO, nowStamp } from "./data";

// Fix 5 — the date helpers must produce ISO-shaped strings regardless of the
// runtime's default locale / ICU build.
describe("date helpers", () => {
  it("nowStamp is YYYY-MM-DD HH:MM:SS", () => {
    expect(nowStamp()).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it("localDateISO is YYYY-MM-DD and daysAgo walks backwards", () => {
    expect(localDateISO(0)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(localDateISO(1)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(localDateISO(1) < localDateISO(0)).toBe(true);
  });

  it("nowStamp's date half agrees with localDateISO(0)", () => {
    expect(nowStamp().slice(0, 10)).toBe(localDateISO(0));
  });
});
