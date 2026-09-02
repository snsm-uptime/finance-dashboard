import { describe, expect, it } from "vitest";

import { AVATAR_PALETTE, pickAvatarColor, pickTextColor } from "@/lib/avatarColor";

function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "");
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(hexA: string, hexB: string): number {
  const la = relativeLuminance(hexA);
  const lb = relativeLuminance(hexB);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("pickAvatarColor", () => {
  it("is deterministic for the same seed", () => {
    expect(pickAvatarColor("user-123")).toBe(pickAvatarColor("user-123"));
    expect(pickAvatarColor("user-123")).toBe(pickAvatarColor("user-123"));
  });

  it("always returns one of the fixed 4-color palette", () => {
    const seeds = ["a", "b", "user-1", "user-2", "00000000-0000-0000-0000-000000000000"];
    for (const seed of seeds) {
      expect(AVATAR_PALETTE).toContain(pickAvatarColor(seed));
    }
  });

  it("distributes different seeds across the palette (not all the same color)", () => {
    const seeds = Array.from({ length: 40 }, (_, i) => `seed-${i}`);
    const colors = new Set(seeds.map(pickAvatarColor));
    expect(colors.size).toBeGreaterThan(1);
  });
});

describe("pickTextColor", () => {
  it("is deterministic for the same background", () => {
    expect(pickTextColor("#4E8098")).toBe(pickTextColor("#4E8098"));
  });

  it("reaches at least a 4.5:1 contrast ratio against every palette color", () => {
    for (const bg of AVATAR_PALETTE) {
      const text = pickTextColor(bg);
      expect(contrastRatio(bg, text)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("clears 4.5:1 for arbitrary light and dark backgrounds", () => {
    for (const bg of ["#ffffff", "#000000", "#f4a261", "#123456", "#abcdef"]) {
      const text = pickTextColor(bg);
      expect(contrastRatio(bg, text)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
