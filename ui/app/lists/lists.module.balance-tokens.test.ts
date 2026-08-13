import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { balanceTone } from "./listsClient";

const here = dirname(fileURLToPath(import.meta.url));

describe("homepage balance polarity tokens", () => {
  it("balanceTone still maps negative → owe, positive → owed, zero → zero", () => {
    expect(balanceTone("-12.50")).toBe("owe");
    expect(balanceTone("15")).toBe("owed");
    expect(balanceTone("0")).toBe("zero");
    expect(balanceTone(undefined)).toBe("zero");
  });

  it("lists.module.scss uses Warm Balance owe/owed vars on homepage balance amounts", () => {
    const css = readFileSync(join(here, "lists.module.scss"), "utf8");
    expect(css).toContain(".balanceOwe .balanceAmount");
    expect(css).toContain(".balanceOwed .balanceAmount");
    expect(css).toContain("var(--owe)");
    expect(css).toContain("var(--owed)");
    const oweBlock = css.slice(
      css.indexOf(".balanceOwe .balanceAmount"),
      css.indexOf(".balanceOwed .balanceAmount"),
    );
    const owedBlock = css.slice(
      css.indexOf(".balanceOwed .balanceAmount"),
      css.indexOf(".balanceZero .balanceAmount"),
    );
    expect(oweBlock).toContain("var(--owe)");
    expect(oweBlock).not.toContain("#8b3a2a");
    expect(owedBlock).toContain("var(--owed)");
    expect(owedBlock).not.toContain("var(--accent)");
  });
});
