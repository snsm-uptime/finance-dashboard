import { describe, expect, it } from "vitest";

import { detectLocale, signInMessages } from "./signin";

describe("sign-in i18n", () => {
  it("detects es from Accept-Language", () => {
    expect(detectLocale("es-CR,es;q=0.9")).toBe("es");
    expect(detectLocale("en-US")).toBe("en");
  });

  it("ships generic credential error in EN and ES", () => {
    expect(signInMessages.en.errorGeneric.toLowerCase()).toContain("invalid");
    expect(signInMessages.es.errorGeneric.length).toBeGreaterThan(10);
  });
});
