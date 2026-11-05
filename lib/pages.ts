/**
 * Page selection parsing, e.g. "1-3, 5, 8-10".
 * Shared by browser (instant feedback) and server (authoritative validation).
 */
export type PageSelectionResult =
  | { ok: true; pages: number[]; normalized: string; count: number }
  | { ok: false; error: string };

/** Turns a sorted list of unique pages into "1-3,5,8-10". */
export function compressPages(pages: number[]): string {
  const parts: string[] = [];
  let i = 0;
  while (i < pages.length) {
    let j = i;
    while (j + 1 < pages.length && pages[j + 1] === pages[j] + 1) j++;
    parts.push(i === j ? `${pages[i]}` : `${pages[i]}-${pages[j]}`);
    i = j + 1;
  }
  return parts.join(",");
}

/**
 * @param input "all" (or empty when allowEmptyAsAll) or a range list.
 * @param pageCount total pages in the document.
 */
export function parsePageSelection(input: string, pageCount: number): PageSelectionResult {
  if (!Number.isInteger(pageCount) || pageCount < 1) {
    return { ok: false, error: "This document has no printable pages." };
  }
  const raw = (input ?? "").trim().toLowerCase();
  if (raw === "all") {
    const pages = Array.from({ length: pageCount }, (_, k) => k + 1);
    return { ok: true, pages, normalized: "all", count: pageCount };
  }
  if (raw === "") {
    return { ok: false, error: "Enter the pages to print, for example 1-3, 5." };
  }
  if (!/^[\d\s,\-–]+$/.test(raw)) {
    return { ok: false, error: "Use only numbers, commas and dashes, for example 1-3, 5." };
  }

  const selected = new Set<number>();
  const tokens = raw.split(",").map((t) => t.trim());
  for (const token of tokens) {
    if (token === "") {
      return { ok: false, error: "There is an extra comma in your page list." };
    }
    const range = token.split(/\s*[-–]\s*/);
    if (range.length === 1) {
      const n = Number(range[0]);
      if (!Number.isInteger(n) || n < 1) return { ok: false, error: `"${token}" is not a valid page number.` };
      if (n > pageCount) return { ok: false, error: `Page ${n} doesn't exist. This document has ${pageCount} page${pageCount === 1 ? "" : "s"}.` };
      selected.add(n);
    } else if (range.length === 2 && range[0] !== "" && range[1] !== "") {
      const a = Number(range[0]);
      const b = Number(range[1]);
      if (!Number.isInteger(a) || !Number.isInteger(b) || a < 1 || b < 1) {
        return { ok: false, error: `"${token}" is not a valid page range.` };
      }
      if (a > b) return { ok: false, error: `"${token}" goes backwards. Write it as ${b}-${a}.` };
      if (b > pageCount) return { ok: false, error: `Page ${b} doesn't exist. This document has ${pageCount} page${pageCount === 1 ? "" : "s"}.` };
      for (let p = a; p <= b; p++) selected.add(p);
    } else {
      return { ok: false, error: `"${token}" is not a valid page range.` };
    }
  }

  const pages = [...selected].sort((x, y) => x - y);
  const normalized = pages.length === pageCount ? "all" : compressPages(pages);
  return { ok: true, pages, normalized, count: pages.length };
}
