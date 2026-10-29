import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  budgetPeriodFor,
  daysBetween,
  formatPeriod,
  isValidIsoDate,
  todayIn,
} from "./dates";

describe("budgetPeriodFor", () => {
  it("uses the calendar month when months start on the 1st", () => {
    expect(budgetPeriodFor("2026-10-29", 1)).toEqual({ month: "2026-10-01", start: "2026-10-01", end: "2026-11-01" });
  });

  it("puts days before the start day in the previous period", () => {
    expect(budgetPeriodFor("2026-10-24", 25)).toEqual({ month: "2026-09-01", start: "2026-09-25", end: "2026-10-25" });
    expect(budgetPeriodFor("2026-10-25", 25)).toEqual({ month: "2026-10-01", start: "2026-10-25", end: "2026-11-25" });
  });

  it("crosses the year boundary", () => {
    expect(budgetPeriodFor("2027-01-03", 10)).toEqual({ month: "2026-12-01", start: "2026-12-10", end: "2027-01-10" });
    expect(budgetPeriodFor("2026-12-31", 1)).toEqual({ month: "2026-12-01", start: "2026-12-01", end: "2027-01-01" });
  });

  it("handles February with a late start day", () => {
    expect(budgetPeriodFor("2027-02-28", 28)).toEqual({ month: "2027-02-01", start: "2027-02-28", end: "2027-03-28" });
    expect(budgetPeriodFor("2028-02-29", 28).month).toBe("2028-02-01");
  });

  it("rejects bad input", () => {
    expect(() => budgetPeriodFor("2026-02-30", 1)).toThrow();
    expect(() => budgetPeriodFor("2026-10-01", 31)).toThrow();
  });
});

describe("date helpers", () => {
  it("adds months across years", () => {
    expect(addMonths(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(addMonths(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
  });

  it("adds days across month ends and leap years", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("counts days between dates", () => {
    expect(daysBetween("2026-10-29", "2026-11-01")).toBe(3);
    expect(daysBetween("2026-11-01", "2026-10-29")).toBe(-3);
  });

  it("validates ISO dates", () => {
    expect(isValidIsoDate("2026-10-29")).toBe(true);
    expect(isValidIsoDate("2026-13-01")).toBe(false);
    expect(isValidIsoDate("29/10/2026")).toBe(false);
  });

  it("gets today in Karachi rather than UTC", () => {
    // 20:30 UTC on the 31st is already the 1st in Karachi (UTC+5).
    expect(todayIn("Asia/Karachi", new Date("2026-10-31T20:30:00Z"))).toBe("2026-11-01");
  });

  it("labels periods", () => {
    expect(formatPeriod(budgetPeriodFor("2026-10-29", 1))).toBe("October 2026");
    expect(formatPeriod(budgetPeriodFor("2026-10-29", 25))).toMatch(/^25 Oct – 24 Nov$/);
  });
});
