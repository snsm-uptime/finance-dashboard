import { describe, expect, it } from "vitest";

import { detectLocale, signupMessages } from "@/lib/i18n/signup";

describe("signup i18n", () => {
  it("defaults to en", () => {
    expect(detectLocale(null)).toBe("en");
  });

  it("detects Spanish from Accept-Language", () => {
    expect(detectLocale("es-CR,es;q=0.9")).toBe("es");
  });

  it("ships EN and ES keys for signup chrome", () => {
    const enKeys = Object.keys(signupMessages.en).sort();
    const esKeys = Object.keys(signupMessages.es).sort();
    expect(esKeys).toEqual(enKeys);
    expect(signupMessages.en.submit).toBeTruthy();
    expect(signupMessages.es.submit).toBeTruthy();
  });
});
