import { existsSync, readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { describe, it, expect } from "vitest";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";

const __dirname = dirname(fileURLToPath(import.meta.url));
const uiRoot = resolve(__dirname, "..");
const globalsPath = resolve(uiRoot, "app/globals.css");

describe("Tailwind + Warm Balance bridge", () => {
  it("@theme references existing CSS variables", () => {
    const css = readFileSync(globalsPath, "utf-8");
    expect(css).toContain('@import "tailwindcss"');
    expect(css).toContain("@theme");
    expect(css).toContain("--color-background: var(--background)");
    expect(css).toContain("--color-accent: var(--accent)");
    expect(css).toContain("@custom-variant dark");
  });

  it("a PostCSS config registers @tailwindcss/postcss (Next.js does not auto-detect it)", () => {
    const candidates = ["postcss.config.mjs", "postcss.config.js", "postcss.config.cjs"];
    const configPath = candidates.map((f) => resolve(uiRoot, f)).find(existsSync);

    expect(
      configPath,
      "No postcss.config.{mjs,js,cjs} found — Next.js/Turbopack will not run the Tailwind PostCSS plugin, and globals.css ships to the browser unprocessed (raw @theme/@custom-variant text, zero generated utilities)."
    ).toBeDefined();

    const configSource = readFileSync(configPath as string, "utf-8");
    expect(configSource).toContain("@tailwindcss/postcss");
  });

  it("compiles globals.css through the real Tailwind pipeline instead of passing @theme through raw", async () => {
    const css = readFileSync(globalsPath, "utf-8");
    const result = await postcss([tailwindcss()]).process(css, { from: globalsPath });

    // If Tailwind never actually ran (e.g. wrong plugin config), these raw at-rules pass through verbatim.
    expect(result.css).not.toMatch(/@theme\s*\{/);
    expect(result.css).not.toMatch(/@custom-variant\s+dark/);

    // Real Tailwind v4 output is organized into cascade layers.
    expect(result.css).toContain("@layer theme");
    expect(result.css).toContain("@layer base");

    // Warm Balance token values must survive the compile untouched.
    expect(result.css).toContain("--wb-bg");
  });
});
