import { describe, expect, it } from "vitest";

import { aliasMessages } from "@/lib/i18n/alias";

describe("alias i18n", () => {
  it("ships the same keys in EN and ES", () => {
    const en = Object.keys(aliasMessages.en).sort();
    const es = Object.keys(aliasMessages.es).sort();
    expect(es).toEqual(en);
  });

  it("has non-empty copy for every key in both locales", () => {
    for (const locale of ["en", "es"] as const) {
      for (const [key, value] of Object.entries(aliasMessages[locale])) {
        expect(value.trim(), `${locale}.${key}`).not.toBe("");
      }
    }
  });

  it("never labels the alias field with email wording", () => {
    for (const locale of ["en", "es"] as const) {
      const copy = Object.values(aliasMessages[locale]).join(" ").toLowerCase();
      expect(copy).not.toContain("@");
    }
  });
});
