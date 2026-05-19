export function normalizeKey(input: unknown): string {
  if (typeof input !== "string") return "";
  return input
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}
