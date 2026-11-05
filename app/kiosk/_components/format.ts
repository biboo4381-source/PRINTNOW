/** "PN482917" → ["PN", "482", "917"] */
export function formatCollectionCodeParts(code: string): [string, string, string] {
  const digits = code.replace(/^PN/i, "");
  return ["PN", digits.slice(0, 3), digits.slice(3, 6)];
}
