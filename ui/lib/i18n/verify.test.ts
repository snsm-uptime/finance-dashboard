import { describe, expect, it } from "vitest";

import { verifyMessages } from "./verify";

describe("verify i18n", () => {
  it("ships the same keys in EN and ES", () => {
    expect(Object.keys(verifyMessages.en).sort()).toEqual(
      Object.keys(verifyMessages.es).sort(),
    );
  });

  it("has non-empty copy for every key in both locales", () => {
    for (const locale of ["en", "es"] as const) {
      for (const [key, value] of Object.entries(verifyMessages[locale])) {
        expect(value.trim(), `${locale}.${key}`).not.toBe("");
      }
    }
  });
});
