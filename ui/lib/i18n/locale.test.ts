import { describe, expect, it } from "vitest";

import { detectLocale } from "./locale";

describe("detectLocale", () => {
  it("defaults to en", () => {
    expect(detectLocale(null)).toBe("en");
    expect(detectLocale("")).toBe("en");
    expect(detectLocale("fr-FR")).toBe("en");
  });

  it("prefers Spanish when highest q among supported", () => {
    expect(detectLocale("es-CR,es;q=0.9,en;q=0.8")).toBe("es");
    expect(detectLocale("en-US,en;q=0.9,es;q=0.8")).toBe("en");
  });

  it("prefers es on equal q", () => {
    expect(detectLocale("en;q=0.9,es;q=0.9")).toBe("es");
  });
});
