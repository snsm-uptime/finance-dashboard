/** Shared locale helpers — EN/ES only (Account prefs = Story 1.6). */
export type Locale = "en" | "es";

export type ThemePreference = "light" | "dark" | "system";

export function detectLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage?.trim()) return "en";

  let best: Locale = "en";
  let bestQ = -1;

  for (const part of acceptLanguage.split(",")) {
    const piece = part.trim();
    if (!piece) continue;
    let tag: string;
    let q = 1;
    if (piece.includes(";q=")) {
      const [rawTag, rawQ] = piece.split(";q=");
      tag = (rawTag ?? "").trim().toLowerCase();
      const parsed = Number.parseFloat((rawQ ?? "").trim());
      q = Number.isFinite(parsed) ? parsed : 0;
    } else {
      tag = piece.toLowerCase();
    }
    let lang: Locale | null = null;
    if (tag.startsWith("es")) lang = "es";
    else if (tag.startsWith("en")) lang = "en";
    if (!lang) continue;
    if (q > bestQ) {
      bestQ = q;
      best = lang;
    } else if (q === bestQ && lang === "es" && best === "en") {
      best = "es";
    }
  }
  return best;
}

export function browserLocale(): Locale {
  if (typeof navigator === "undefined") return "en";
  const header = [navigator.language, ...(navigator.languages ?? [])].join(",");
  return detectLocale(header);
}
