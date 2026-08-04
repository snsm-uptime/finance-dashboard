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
    const qMatch = /;\s*q\s*=/i.exec(piece);
    if (qMatch && qMatch.index !== undefined) {
      tag = piece.slice(0, qMatch.index).trim().toLowerCase();
      const parsed = Number.parseFloat(piece.slice(qMatch.index + qMatch[0].length).trim());
      q = Number.isFinite(parsed) ? parsed : 0;
    } else {
      tag = piece.toLowerCase();
    }
    if (q <= 0) continue;
    const primary = tag.split("-")[0] ?? "";
    let lang: Locale | null = null;
    if (primary === "es") lang = "es";
    else if (primary === "en") lang = "en";
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
