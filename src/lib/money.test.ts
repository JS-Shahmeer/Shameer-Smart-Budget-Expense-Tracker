import { describe, expect, it } from "vitest";
import { formatMoney, minorToInputValue, parseAmountToMinor } from "./money";

describe("parseAmountToMinor", () => {
  it.each([
    ["1500", 150000],
    ["1,500", 150000],
    ["2499.5", 249950],
    ["0.01", 1],
    [" 75.25 ", 7525],
    [320, 32000],
  ])("parses %s", (input, expected) => {
    expect(parseAmountToMinor(input)).toBe(expected);
  });

  it.each(["", "0", "0.00", "-5", "1.234", "abc", "1e5", "12..5", "Infinity", "NaN", "9999999999999999"])(
    "rejects %s",
    (input) => {
      expect(parseAmountToMinor(input)).toBeNull();
    },
  );
});

describe("minorToInputValue", () => {
  it("round-trips with parseAmountToMinor", () => {
    for (const minor of [1, 50, 100, 150000, 249950]) {
      expect(parseAmountToMinor(minorToInputValue(minor))).toBe(minor);
    }
  });
});

describe("formatMoney", () => {
  it("formats PKR without decimals on whole amounts", () => {
    expect(formatMoney(150000)).toMatch(/1,500$/);
    expect(formatMoney(150000)).not.toContain(".");
  });

  it("keeps paisa when present", () => {
    expect(formatMoney(249950)).toMatch(/2,499\.50$/);
  });

  it("shows negatives", () => {
    expect(formatMoney(-5000)).toContain("-");
  });
});
