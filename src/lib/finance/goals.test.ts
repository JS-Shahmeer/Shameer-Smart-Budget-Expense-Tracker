import { describe, expect, it } from "vitest";
import { goalProgress, monthsUntil, type GoalInput, type GoalTransfer } from "./goals";

const types: Record<string, "bank" | "savings"> = { bank: "bank", save: "savings" };
const accountType = (id: string) => types[id];

const goal: GoalInput = {
  id: "g1",
  name: "Laptop",
  target_minor: 30_000_000, // Rs 300,000
  starting_minor: 5_000_000,
  target_date: "2027-03-15",
  monthly_contribution_minor: 5_000_000,
  account_id: "save",
  status: "active",
};

const t = (amount: number, date: string, from = "bank", to = "save"): GoalTransfer => ({
  amount_minor: amount,
  occurred_on: date,
  account_id: from,
  to_account_id: to,
  savings_goal_id: "g1",
});

describe("monthsUntil", () => {
  it("counts budget months inclusively", () => {
    expect(monthsUntil("2026-10-29", "2027-03-15", 1)).toBe(6);
    expect(monthsUntil("2026-10-29", "2026-10-31", 1)).toBe(1);
  });
});

describe("goalProgress", () => {
  it("adds contributions and subtracts withdrawals", () => {
    const p = goalProgress(goal, [t(2_000_000, "2026-09-05"), t(3_000_000, "2026-10-02"), t(1_000_000, "2026-10-20", "save", "bank")], "2026-10-29", 1, accountType);
    expect(p.savedMinor).toBe(9_000_000);
    expect(p.contributedThisMonthMinor).toBe(2_000_000);
    expect(p.percent).toBe(30);
  });

  it("works out the monthly amount needed to finish on time", () => {
    // Rs 300,000 - 50,000 starting = 250,000 over 6 months.
    const p = goalProgress({ ...goal, monthly_contribution_minor: 3_000_000 }, [], "2026-10-29", 1, accountType);
    expect(p.requiredMonthlyMinor).toBe(4_166_667);
    expect(p.pace).toBe("behind");
    expect(p.dueThisMonthMinor).toBe(4_166_667);
  });

  it("is on track when the plan covers the required amount", () => {
    const p = goalProgress(goal, [t(1_000_000, "2026-10-02")], "2026-10-29", 1, accountType);
    expect(p.pace).toBe("on-track");
    expect(p.dueThisMonthMinor).toBe(4_000_000);
  });

  it("is reached and owes nothing once the target is met", () => {
    const p = goalProgress(goal, [t(25_000_000, "2026-10-02")], "2026-10-29", 1, accountType);
    expect(p).toMatchObject({ reached: true, pace: "reached", dueThisMonthMinor: 0, remainingMinor: 0, percent: 100 });
  });

  it("is overdue after the target date", () => {
    expect(goalProgress(goal, [], "2027-04-02", 1, accountType).pace).toBe("overdue");
  });

  it("treats goals without a date or plan as no-plan", () => {
    const p = goalProgress({ ...goal, target_date: null, monthly_contribution_minor: null }, [], "2026-10-29", 1, accountType);
    expect(p.pace).toBe("no-plan");
    expect(p.dueThisMonthMinor).toBe(0);
  });

  it("uses the savings account type for goals without an account", () => {
    const p = goalProgress({ ...goal, account_id: null }, [t(1_000_000, "2026-10-02"), t(400_000, "2026-10-03", "save", "bank")], "2026-10-29", 1, accountType);
    expect(p.savedMinor).toBe(5_600_000);
  });
});
