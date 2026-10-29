import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";

describe("toCsv", () => {
  it("quotes commas, quotes and line breaks", () => {
    expect(toCsv([["a,b", 'say "hi"', "two\nlines", "plain"]])).toBe('"a,b","say ""hi""","two\nlines",plain\r\n');
  });

  it("writes numbers as they are and empty cells for null", () => {
    expect(toCsv([[1500, 12.05, -3, null, undefined]])).toBe("1500,12.05,-3,,\r\n");
  });

  it("stops text from running as a spreadsheet formula", () => {
    expect(toCsv([["=HYPERLINK(\"x\")", "+1", "-2", "@SUM(A1)"]])).toBe(`"'=HYPERLINK(""x"")",'+1,'-2,'@SUM(A1)\r\n`);
  });

  it("ends every row with CRLF", () => {
    expect(toCsv([["a"], ["b"]])).toBe("a\r\nb\r\n");
  });
});
