import { describe, expect, it } from "vitest";
import { assessPurchase, dailyPlan, nextPayday } from "./planner";

describe("nextPayday", () => {
  it.each([
    ["2026-10-29", 1, "2026-11-01"],
    ["2026-10-01", 1, "2026-11-01"], // payday today: the next one is next month
    ["2026-10-10", 25, "2026-10-25"],
    ["2026-01-30", 31, "2026-01-31"],
    ["2026-02-10", 31, "2026-02-28"], // clamped to a short month
    ["2026-02-28", 30, "2026-03-30"],
    ["2026-12-20", 5, "2027-01-05"],
  ])("%s with payday %i -> %s", (today, day, expected) => {
    expect(nextPayday(today, day)).toBe(expected);
  });
});

describe("dailyPlan", () => {
  const base = {
    today: "2026-10-22",
    paydayDay: 1, // 10 days left: 22nd to 31st
    availableMinor: 5_000_000, // Rs 50,000
    spentTodayMinor: 0,
    commitments: [
      { name: "Internet", date: "2026-10-25", amountMinor: 350_000, type: "bill" as const },
      { name: "Car goal", date: "2026-10-22", amountMinor: 1_000_000, type: "savings" as const },
    ],
  };

  it("leaves bills and savings out of what can be spent", () => {
    const plan = dailyPlan(base);
    expect(plan.daysLeft).toBe(10);
    expect(plan.billsMinor).toBe(350_000);
    expect(plan.savingsMinor).toBe(1_000_000);
    expect(plan.freeMinor).toBe(3_650_000);
    expect(plan.dailyLimitMinor).toBe(365_000); // Rs 3,650 a day
  });

  it("keeps the limit steady during the day and reduces what is left today", () => {
    const morning = dailyPlan(base);
    const evening = dailyPlan({ ...base, availableMinor: 5_000_000 - 200_000, spentTodayMinor: 200_000 });
    expect(evening.dailyLimitMinor).toBe(morning.dailyLimitMinor);
    expect(evening.leftTodayMinor).toBe(165_000);
  });

  it("rounds down to whole rupees", () => {
    expect(dailyPlan({ ...base, commitments: [], availableMinor: 1_000_050 }).dailyLimitMinor).toBe(100_000);
  });

  it("reports a shortfall when commitments exceed the money", () => {
    const plan = dailyPlan({ ...base, availableMinor: 1_000_000 });
    expect(plan.dailyLimitMinor).toBe(0);
    expect(plan.shortfallMinor).toBe(350_000);
  });

  it("uses at least one day on the day before payday", () => {
    expect(dailyPlan({ ...base, today: "2026-10-31", commitments: [] }).daysLeft).toBe(1);
  });
});

describe("assessPurchase", () => {
  const plan = dailyPlan({
    today: "2026-10-22",
    paydayDay: 1,
    availableMinor: 5_000_000,
    spentTodayMinor: 0,
    commitments: [{ name: "Rent", date: "2026-10-28", amountMinor: 3_000_000, type: "bill" }],
  });
  // free = Rs 20,000, Rs 2,000 a day

  it("is comfortable for a small purchase", () => {
    const result = assessPurchase(plan, { amountMinor: 300_000, monthlySavingsMinor: 0 });
    expect(result.verdict).toBe("comfortable");
    expect(result.newDailyLimitMinor).toBe(170_000);
  });

  it("is tight when it more than halves the daily limit", () => {
    expect(assessPurchase(plan, { amountMinor: 1_500_000, monthlySavingsMinor: 0 }).verdict).toBe("tight");
  });

  it("flags money that is set aside for bills", () => {
    const result = assessPurchase(plan, { amountMinor: 2_500_000, monthlySavingsMinor: 250_000 });
    expect(result.verdict).toBe("uses-commitments");
    expect(result.fromCommitmentsMinor).toBe(500_000);
    expect(result.savingsDelayMonths).toBe(2);
  });

  it("can't buy more than the balance", () => {
    expect(assessPurchase(plan, { amountMinor: 6_000_000, monthlySavingsMinor: 0 }).verdict).toBe("cannot");
  });

  it("warns about the category budget", () => {
    const result = assessPurchase(plan, { amountMinor: 300_000, budget: { limitMinor: 1_000_000, spentMinor: 800_000 }, monthlySavingsMinor: 0 });
    expect(result.budget).toMatchObject({ over: true, remainingAfterMinor: -100_000 });
    expect(result.verdict).toBe("tight");
  });
});
