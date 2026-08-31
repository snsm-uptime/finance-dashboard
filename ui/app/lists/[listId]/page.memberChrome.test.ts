import { describe, expect, it } from "vitest";

import { showSettleChromeFrom } from "./page";

describe("showSettleChromeFrom", () => {
  it("solo list with valid balances never shows settle chrome", () => {
    expect(showSettleChromeFrom(1, true)).toBe(false);
  });

  it("second member restores settle chrome when balances are valid", () => {
    expect(showSettleChromeFrom(2, true)).toBe(true);
  });

  it("solo list with a balances load error stays hidden", () => {
    expect(showSettleChromeFrom(1, false)).toBe(false);
  });

  it("shared list still respects the existing balances-load-error guard", () => {
    expect(showSettleChromeFrom(2, false)).toBe(false);
  });
});
