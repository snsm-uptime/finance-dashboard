/**
 * Deterministic avatar color + auto-contrast text color — pure functions,
 * no DOM/canvas so they stay unit-testable without a browser environment.
 *
 * Palette is fixed (no per-user persistence needed): the same seed
 * (user_id/member_id) always hashes to the same one of the 4 colors.
 */

export const AVATAR_PALETTE = ["#4E8098", "#CBBAED", "#44344F", "#F4A261"] as const;

const MIN_CONTRAST_RATIO = 4.5;

/** Small stable string hash (djb2) — deterministic across runs/platforms. */
function hashString(seed: string): number {
  let hash = 5381;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 33) ^ seed.charCodeAt(i);
  }
  return hash >>> 0;
}

/** Same seed always picks the same palette color. */
export function pickAvatarColor(seed: string): string {
  const index = hashString(seed) % AVATAR_PALETTE.length;
  return AVATAR_PALETTE[index];
}

type Rgb = { r: number; g: number; b: number };

function hexToRgb(hex: string): Rgb {
  const normalized = hex.replace("#", "");
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return { r, g, b };
}

function rgbToHex({ r, g, b }: Rgb): string {
  const toHex = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** WCAG relative luminance (sRGB), 0 (black) to 1 (white). */
function relativeLuminance({ r, g, b }: Rgb): number {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const [rl, gl, bl] = [channel(r), channel(g), channel(b)];
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}

/** WCAG contrast ratio between two relative luminances (lighter over darker). */
function contrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function rgbToHsl({ r, g, b }: Rgb): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  switch (max) {
    case rn:
      h = (gn - bn) / d + (gn < bn ? 6 : 0);
      break;
    case gn:
      h = (bn - rn) / d + 2;
      break;
    default:
      h = (rn - gn) / d + 4;
  }
  h /= 6;
  return { h, s, l };
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  if (s === 0) {
    const v = l * 255;
    return { r: v, g: v, b: v };
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: hue2rgb(p, q, h + 1 / 3) * 255,
    g: hue2rgb(p, q, h) * 255,
    b: hue2rgb(p, q, h - 1 / 3) * 255,
  };
}

/**
 * Text color for a background hex, same hue lightened/darkened in steps
 * until the WCAG contrast ratio against the background reaches >= 4.5:1.
 */
export function pickTextColor(bgHex: string): string {
  const bgRgb = hexToRgb(bgHex);
  const bgLuminance = relativeLuminance(bgRgb);
  const { h, s, l: bgL } = rgbToHsl(bgRgb);

  // Walk the same hue toward whichever extreme (black or white) contrasts
  // more against this exact background, stepping until the WCAG AA
  // threshold (4.5:1) clears, rather than hardcoding per-color text or
  // guessing the direction from luminance alone (a mid-bright background
  // can contrast better against black even past the 0.5 luminance line).
  const goingDarker = contrastRatio(bgLuminance, 0) >= contrastRatio(bgLuminance, 1);
  const step = goingDarker ? -0.05 : 0.05;
  let l = bgL;

  for (let i = 0; i < 21; i += 1) {
    l += step;
    if (l < 0) l = 0;
    if (l > 1) l = 1;
    const candidateHex = rgbToHex(hslToRgb(h, s, l));
    // Re-derive luminance from the rounded 8-bit hex (what actually renders)
    // so quantization can never quietly drop the ratio below the threshold.
    const candidateLuminance = relativeLuminance(hexToRgb(candidateHex));
    if (contrastRatio(bgLuminance, candidateLuminance) >= MIN_CONTRAST_RATIO) {
      return candidateHex;
    }
    if (l === 0 || l === 1) break;
  }

  // Fallback — pure black/white always clears 4.5:1 against any color.
  return goingDarker ? "#000000" : "#ffffff";
}
