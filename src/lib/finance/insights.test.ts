import { describe, expect, it } from "vitest";
import { budgetPeriodForMonth } from "@/lib/dates";
import { amountsByCategory, buildMonthReport, monthlyTotals, percentChange, totalsOf, type InsightTransaction } from "./insights";

const isSavings = (id: string | null) => id === "save";
const categories = [
  { id: "food", name: "Food", color: "#f97316" },
  { id: "rent", name: "Rent", color: "#a855f7" },
  { id: "fuel", name: "Fuel", color: "#22c55e" },
  { id: "salary", name: "Salary", color: "#3b82f6" },
];

let next = 0;
function tx(partial: Partial<InsightTransaction> & Pick<InsightTransaction, "kind" | "amount_minor">): InsightTransaction {
  next += 1;
  return {
    id: `t${next}`,
    occurred_on: "2026-10-10",
    account_id: "bank",
    to_account_id: null,
    category_id: null,
    savings_goal_id: null,
    payment_method: null,
    description: null,
    ...partial,
  };
}

describe("totalsOf", () => {
  it("keeps transfers out of income and spending", () => {
    const totals = totalsOf(
      [
        tx({ kind: "income", amount_minor: 20000000 }),
        tx({ kind: "expense", amount_minor: 5000000 }),
        tx({ kind: "transfer", amount_minor: 3000000, to_account_id: "save" }),
        tx({ kind: "transfer", amount_minor: 1000000, account_id: "bank", to_account_id: "cash" }),
      ],
      isSavings,
    );
    expect(totals).toEqual({
      incomeMinor: 20000000,
      expensesMinor: 5000000,
      savedMinor: 3000000,
      netMinor: 15000000,
      savingsRate: 15,
    });
  });

  it("has no savings rate without income", () => {
    expect(totalsOf([tx({ kind: "expense", amount_minor: 100 })], isSavings).savingsRate).toBeNull();
  });
});

describe("monthlyTotals", () => {
  it("buckets by budget period, honouring a month start day", () => {
    const periods = [budgetPeriodForMonth("2026-09-01", 25), budgetPeriodForMonth("2026-10-01", 25)];
    const months = monthlyTotals(
      [
        tx({ kind: "expense", amount_minor: 100, occurred_on: "2026-09-24" }), // before both periods
        tx({ kind: "expense", amount_minor: 200, occurred_on: "2026-09-25" }), // first day of September's period
        tx({ kind: "expense", amount_minor: 300, occurred_on: "2026-10-24" }), // last day of September's period
        tx({ kind: "expense", amount_minor: 400, occurred_on: "2026-10-25" }), // October's period
        tx({ kind: "transfer", amount_minor: 50, occurred_on: "2026-10-26", account_id: "save", to_account_id: "bank" }),
      ],
      periods,
      isSavings,
    );
    expect(months.map((m) => [m.month, m.expensesMinor, m.savedMinor])).toEqual([
      ["2026-09-01", 500, 0],
      ["2026-10-01", 400, -50],
    ]);
  });
});

describe("amountsByCategory", () => {
  const spending = [
    tx({ kind: "expense", amount_minor: 600, category_id: "rent" }),
    tx({ kind: "expense", amount_minor: 300, category_id: "food" }),
    tx({ kind: "expense", amount_minor: 50, category_id: "fuel" }),
    tx({ kind: "expense", amount_minor: 50, category_id: null }),
    tx({ kind: "income", amount_minor: 9999, category_id: "salary" }),
  ];

  it("sorts largest first with shares of the total", () => {
    const rows = amountsByCategory(spending, "expense", categories);
    expect(rows.map((r) => [r.name, r.amountMinor, r.share])).toEqual([
      ["Rent", 600, 60],
      ["Food", 300, 30],
      ["Fuel", 50, 5],
      ["Uncategorized", 50, 5],
    ]);
  });

  it("folds the tail into Other when limited", () => {
    const rows = amountsByCategory(spending, "expense", categories, 3);
    expect(rows.map((r) => [r.id, r.name, r.amountMinor])).toEqual([
      ["rent", "Rent", 600],
      ["food", "Food", 300],
      ["other", "Other (2)", 100],
    ]);
  });

  it("returns nothing when there is nothing of that kind", () => {
    expect(amountsByCategory([], "income", categories)).toEqual([]);
  });
});

describe("buildMonthReport", () => {
  const report = buildMonthReport({
    current: [
      tx({ kind: "income", amount_minor: 10000, category_id: "salary" }),
      tx({ kind: "expense", amount_minor: 3000, category_id: "food", payment_method: "cash", description: "Groceries" }),
      tx({ kind: "expense", amount_minor: 500, category_id: "food", payment_method: "debit_card", description: "Lunch" }),
      tx({ kind: "expense", amount_minor: 200, category_id: "fuel", payment_method: "cash" }),
    ],
    previous: [tx({ kind: "expense", amount_minor: 1000, category_id: "food", occurred_on: "2026-09-10" })],
    categories,
    budgets: [
      { category_id: "food", amount_minor: 3000 },
      { category_id: "rent", amount_minor: 50000 },
    ],
    isSavings,
  });

  it("compares spending with budgets and last month, listing unused budgets too", () => {
    expect(report.expensesByCategory.map((l) => [l.id, l.amountMinor, l.budgetMinor, l.previousMinor])).toEqual([
      ["food", 3500, 3000, 1000],
      ["fuel", 200, null, 0],
      ["rent", 0, 50000, 0],
    ]);
  });

  it("groups spending by payment method", () => {
    expect(report.expensesByPaymentMethod).toEqual([
      { method: "cash", amountMinor: 3200, count: 2 },
      { method: "debit_card", amountMinor: 500, count: 1 },
    ]);
  });

  it("lists the largest expenses first and totals both months", () => {
    expect(report.largestExpenses.map((t) => t.amount_minor)).toEqual([3000, 500, 200]);
    expect(report.totals.expensesMinor).toBe(3700);
    expect(report.previousTotals.expensesMinor).toBe(1000);
    expect(report.transactionCount).toBe(4);
  });
});

describe("percentChange", () => {
  it("compares with the previous value", () => {
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(50, 100)).toBe(-50);
  });
  it("is null with nothing to compare against", () => {
    expect(percentChange(100, 0)).toBeNull();
    expect(percentChange(100, -20)).toBeNull();
  });
});
