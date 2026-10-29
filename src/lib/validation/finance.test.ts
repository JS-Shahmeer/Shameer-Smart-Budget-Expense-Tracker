import { describe, expect, it } from "vitest";
import { budgetSchema, parseSignedAmountToMinor, recurringSchema, settingsSchema, transactionSchema } from "./finance";

const A = "3f2b8c1e-6a4d-4e2b-9c1a-0b5d7e8f9a10";
const B = "7c9d2e3f-1a2b-4c3d-8e4f-5a6b7c8d9e0f";
const base = { kind: "expense" as const, amount: "1500", occurredOn: "2026-10-29", accountId: A, categoryId: B };

describe("transactionSchema", () => {
  it("accepts a valid expense", () => {
    expect(transactionSchema.safeParse(base).success).toBe(true);
  });

  it.each([
    [{ amount: "0" }, "amount"],
    [{ amount: "-50" }, "amount"],
    [{ amount: "12.345" }, "amount"],
    [{ occurredOn: "2026-02-30" }, "occurredOn"],
    [{ categoryId: "" }, "categoryId"],
  ])("rejects %o", (change, path) => {
    const result = transactionSchema.safeParse({ ...base, ...change });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual([path]);
  });

  it("requires a different destination for transfers and no category", () => {
    expect(transactionSchema.safeParse({ ...base, kind: "transfer", categoryId: "", toAccountId: A }).success).toBe(false);
    expect(transactionSchema.safeParse({ ...base, kind: "transfer", categoryId: "", toAccountId: B }).success).toBe(true);
  });
});

describe("budgetSchema", () => {
  it("allows an empty amount to clear the budget", () => {
    expect(budgetSchema.safeParse({ categoryId: A, month: "2026-10-01", amount: "" }).success).toBe(true);
    expect(budgetSchema.safeParse({ categoryId: A, month: "2026-10-15", amount: "100" }).success).toBe(false);
  });
});

describe("recurringSchema", () => {
  const rule = {
    name: "Rent",
    kind: "expense",
    amount: "45000",
    accountId: A,
    categoryId: B,
    frequency: "monthly",
    intervalCount: "1",
    startOn: "2026-10-01",
    nextDueOn: "2026-10-01",
    endOn: "",
    isBill: true,
    remindDaysBefore: "3",
  };

  it("accepts a monthly bill and converts numbers", () => {
    const result = recurringSchema.parse(rule);
    expect(result.intervalCount).toBe(1);
    expect(result.remindDaysBefore).toBe(3);
  });

  it("rejects an end before the start", () => {
    expect(recurringSchema.safeParse({ ...rule, endOn: "2026-09-01" }).success).toBe(false);
  });
});

describe("parseSignedAmountToMinor", () => {
  it("handles negative opening balances", () => {
    expect(parseSignedAmountToMinor("-1,200.50")).toBe(-120050);
    expect(parseSignedAmountToMinor("abc")).toBeNull();
  });
});

describe("settingsSchema", () => {
  const valid = {
    displayName: "Shameer",
    currency: "PKR",
    timezone: "Asia/Karachi",
    monthStartDay: "25",
    paydayDay: "31",
    budgetWarningPercent: "80",
  };

  it("accepts sensible settings", () => {
    expect(settingsSchema.safeParse(valid).success).toBe(true);
  });

  it.each([
    ["monthStartDay", "29"],
    ["monthStartDay", "0"],
    ["paydayDay", "32"],
    ["budgetWarningPercent", "101"],
    ["budgetWarningPercent", "1.5"],
    ["currency", "XYZ"],
    ["timezone", "Mars/Olympus"],
  ])("rejects %s = %s", (field, value) => {
    const result = settingsSchema.safeParse({ ...valid, [field]: value });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual([field]);
  });
});
