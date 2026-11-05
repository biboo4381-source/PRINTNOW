import { describe, expect, it } from "vitest";
import { parsePageSelection } from "@/lib/pages";

describe("parsePageSelection", () => {
  it("handles all pages", () => {
    expect(parsePageSelection("all", 5)).toMatchObject({ ok: true, count: 5, normalized: "all" });
  });

  it("parses single pages and ranges", () => {
    const r = parsePageSelection("1-3, 5, 8-10", 12);
    expect(r).toMatchObject({ ok: true, count: 7, normalized: "1-3,5,8-10", pages: [1, 2, 3, 5, 8, 9, 10] });
  });

  it("merges duplicates and overlaps, sorted", () => {
    expect(parsePageSelection("5, 1-3, 2-4, 5", 10)).toMatchObject({ ok: true, normalized: "1-5", count: 5 });
  });

  it("normalizes a full selection to 'all'", () => {
    expect(parsePageSelection("1-4", 4)).toMatchObject({ ok: true, normalized: "all" });
  });

  it("accepts en dashes and spaces", () => {
    expect(parsePageSelection(" 2 – 4 ", 5)).toMatchObject({ ok: true, normalized: "2-4" });
  });

  it.each([
    ["", "Enter the pages"],
    ["0", "not a valid page"],
    ["6", "doesn't exist"],
    ["3-1", "goes backwards"],
    ["1-9", "doesn't exist"],
    ["1,,2", "extra comma"],
    ["1-", "not a valid page range"],
    ["a-b", "Use only numbers"],
    ["1-2-3", "not a valid page range"],
  ])("rejects %j", (input, message) => {
    const r = parsePageSelection(input, 5);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(message);
  });
});
