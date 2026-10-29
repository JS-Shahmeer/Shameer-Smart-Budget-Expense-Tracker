import { describe, expect, it } from "vitest";
import { changePasswordSchema, safeNextPath, signUpSchema } from "./auth";

describe("safeNextPath", () => {
  it.each([
    ["/transactions", "/transactions"],
    ["/budgets?month=2026-10-01", "/budgets?month=2026-10-01"],
    ["https://evil.example", "/"],
    ["//evil.example", "/"],
    ["/\\evil.example", "/"],
    [undefined, "/"],
  ])("%s -> %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });
});

describe("signUpSchema", () => {
  it("requires matching passwords", () => {
    const result = signUpSchema.safeParse({ email: "a@b.co", password: "longenough", confirmPassword: "different" });
    expect(result.success).toBe(false);
  });

  it("normalises the email", () => {
    const result = signUpSchema.parse({ email: " Me@Example.COM ", password: "longenough", confirmPassword: "longenough" });
    expect(result.email).toBe("me@example.com");
  });
});

describe("changePasswordSchema", () => {
  it("needs matching passwords of at least 8 characters", () => {
    expect(changePasswordSchema.safeParse({ password: "long enough", confirmPassword: "long enough" }).success).toBe(true);
    expect(changePasswordSchema.safeParse({ password: "short", confirmPassword: "short" }).success).toBe(false);
    const mismatch = changePasswordSchema.safeParse({ password: "long enough", confirmPassword: "long enougj" });
    expect(mismatch.error?.issues[0]?.path).toEqual(["confirmPassword"]);
  });
});
