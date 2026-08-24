import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, "MenuSurface.module.scss"), "utf8");
const globals = readFileSync(join(here, "../../app/globals.css"), "utf8");

describe("MenuSurface", () => {
  it("tints surface for hover and a stronger selected row, with theme text color", () => {
    expect(globals).toContain(
      "--menu-item-hover: color-mix(in srgb, var(--accent) 10%, var(--surface));",
    );
    expect(globals).toContain(
      "--menu-item-selected: color-mix(in srgb, var(--accent) 22%, var(--surface));",
    );
    expect(css).toContain("color: var(--foreground);");
    expect(css).toContain("background: var(--menu-item-hover);");
    expect(css).toContain("background: var(--menu-item-selected);");
    expect(css).toContain(':not([aria-selected="true"]):not(.itemSelected)');
  });
});
