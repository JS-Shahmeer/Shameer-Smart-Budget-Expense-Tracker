import { describe, expect, it } from "vitest";
import { parseFilters } from "./transaction-filters";

const ID = "3f2b8c1e-6a4d-4e2b-9c1a-0b5d7e8f9a10";

describe("parseFilters", () => {
  it("defaults to the current budget month", () => {
    expect(parseFilters({}, "2026-10-29", 1)).toEqual({ month: "2026-10-01", kind: "", categoryId: "", accountId: "", q: "", page: 1 });
    expect(parseFilters({}, "2026-10-10", 25).month).toBe("2026-09-01");
  });

  it("reads valid values", () => {
    expect(parseFilters({ month: "2026-03", kind: "expense", category: ID, account: ID, q: "food", page: "3" }, "2026-10-29", 1)).toEqual({
      month: "2026-03-01",
      kind: "expense",
      categoryId: ID,
      accountId: ID,
      q: "food",
      page: 3,
    });
    expect(parseFilters({ month: "all" }, "2026-10-29", 1).month).toBe("all");
  });

  it("ignores malformed values", () => {
    const f = parseFilters({ month: "2026-13", kind: "loan", category: "x", account: "1 or 1=1", page: "-2" }, "2026-10-29", 1);
    expect(f).toMatchObject({ month: "2026-10-01", kind: "", categoryId: "", accountId: "", page: 1 });
  });

  it("strips characters that have meaning in PostgREST filters", () => {
    expect(parseFilters({ q: "a,b),category_id.eq.(x" }, "2026-10-29", 1).q).toBe("a b  category_id eq  x");
  });
});
