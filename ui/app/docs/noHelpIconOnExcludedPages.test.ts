import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const uiRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath: string): string {
  return readFileSync(join(uiRoot, relativePath), "utf8");
}

/**
 * AC #4: /account and the public landing page have no matching docs content,
 * so they must never wire in the contextual help icon (DocsHelpButton /
 * useChromeHeader trailing). /home is intentionally excluded from this check —
 * per an explicit product decision on this story, /lists is now a dead
 * permanent-redirect route and ListsPanel (the real Lists surface) renders on
 * /home, so /home carries the Lists help icon instead of a (nonexistent)
 * /lists page.
 */
describe("pages excluded from the docs help icon (Story 8.3, AC #4)", () => {
  it("the public landing page (ui/app/page.tsx) does not reference DocsHelpButton or useChromeHeader", () => {
    const source = read("app/page.tsx");
    expect(source).not.toContain("DocsHelpButton");
    expect(source).not.toContain("useChromeHeader");
  });

  it("/account (ui/app/account/page.tsx) does not reference DocsHelpButton or useChromeHeader", () => {
    const source = read("app/account/page.tsx");
    expect(source).not.toContain("DocsHelpButton");
    expect(source).not.toContain("useChromeHeader");
  });
});
