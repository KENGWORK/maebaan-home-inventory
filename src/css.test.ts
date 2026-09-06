import { describe, expect, it } from "vitest";
import { css } from "./css";

describe("css", () => {
  it("camel-cases keys and keeps values", () => {
    expect(css("padding-top:8px;color:#fff")).toEqual({ paddingTop: "8px", color: "#fff" });
  });
  it("does not split inside parentheses", () => {
    expect(css("background:linear-gradient(145deg,#7A6AE2,#5B49C9);border:none")).toEqual({
      background: "linear-gradient(145deg,#7A6AE2,#5B49C9)",
      border: "none",
    });
  });
  it("keeps custom properties as-is", () => {
    expect(css("--x:1px")).toEqual({ "--x": "1px" });
  });
  it("handles the font shorthand with quoted family", () => {
    expect(css("font:500 24px/1.3 Mitr,sans-serif")).toEqual({ font: "500 24px/1.3 Mitr,sans-serif" });
  });
});
