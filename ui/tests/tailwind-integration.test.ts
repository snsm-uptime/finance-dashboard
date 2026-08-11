import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, it, expect } from "vitest";

describe("Tailwind + Warm Balance bridge", () => {
  it("@theme references existing CSS variables", () => {
    const css = readFileSync(resolve("app/globals.css"), "utf-8");
    expect(css).toContain("@import \"tailwindcss\"");
    expect(css).toContain("@theme");
    expect(css).toContain("--color-background: var(--background)");
    expect(css).toContain("--color-accent: var(--accent)");
    expect(css).toContain("@custom-variant dark");
  });
});
