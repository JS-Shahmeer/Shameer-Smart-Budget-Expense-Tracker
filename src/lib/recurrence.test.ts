import { describe, expect, it } from "vitest";
import { describeFrequency, nextOccurrence, occurrencesBefore } from "./recurrence";

describe("nextOccurrence", () => {
  // Same cases as db-tests/recurring.test.sql, so the two implementations agree.
  it.each([
    ["2026-01-31", "2026-01-31", "monthly", 1, "2026-02-28"],
    ["2026-02-28", "2026-01-31", "monthly", 1, "2026-03-31"],
    ["2028-01-31", "2026-01-31", "monthly", 1, "2028-02-29"],
    ["2026-12-15", "2026-01-15", "monthly", 1, "2027-01-15"],
    ["2026-10-01", "2026-10-01", "monthly", 3, "2027-01-01"],
    ["2026-10-29", "2026-10-29", "weekly", 2, "2026-11-12"],
    ["2028-02-29", "2028-02-29", "yearly", 1, "2029-02-28"],
  ] as const)("%s from %s %s x%i -> %s", (due, start, frequency, interval, expected) => {
    expect(nextOccurrence(due, start, frequency, interval)).toBe(expected);
  });
});

describe("occurrencesBefore", () => {
  const rent = {
    name: "Rent",
    next_due_on: "2026-11-01",
    start_on: "2026-01-01",
    end_on: null,
    frequency: "monthly" as const,
    interval_count: 1,
    is_active: true,
  };

  it("lists every occurrence in the window", () => {
    expect(occurrencesBefore([rent], "2027-01-02").map((o) => o.date)).toEqual(["2026-11-01", "2026-12-01", "2027-01-01"]);
  });

  it("stops at end_on and skips paused rules", () => {
    expect(occurrencesBefore([{ ...rent, end_on: "2026-11-30" }], "2027-06-01")).toHaveLength(1);
    expect(occurrencesBefore([{ ...rent, is_active: false }], "2027-06-01")).toHaveLength(0);
  });

  it("includes overdue occurrences", () => {
    expect(occurrencesBefore([{ ...rent, next_due_on: "2026-09-01" }], "2026-10-15").map((o) => o.date)).toEqual([
      "2026-09-01",
      "2026-10-01",
    ]);
  });
});

it("describes frequencies", () => {
  expect(describeFrequency("monthly", 1)).toBe("Every month");
  expect(describeFrequency("weekly", 2)).toBe("Every 2 weeks");
});
