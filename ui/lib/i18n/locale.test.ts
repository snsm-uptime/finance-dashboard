import { afterEach, describe, expect, it, vi } from "vitest";

import { browserLocale, detectLocale } from "./locale";

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

  it("uses primary subtag (not prefix) and skips q=0", () => {
    expect(detectLocale("est")).toBe("en");
    expect(detectLocale("es;q=0,en;q=0.9")).toBe("en");
    expect(detectLocale("es;Q=0.8,en;q=0.5")).toBe("es");
  });

  it("skips empty parts and non-numeric q values", () => {
    expect(detectLocale("es, ,en;q=0.1")).toBe("es");
    expect(detectLocale("es;q=nope,en;q=0.9")).toBe("en");
  });
});

describe("browserLocale", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults to en when navigator is missing", () => {
    vi.stubGlobal("navigator", undefined);
    expect(browserLocale()).toBe("en");
  });

  it("reads navigator.language and languages", () => {
    vi.stubGlobal("navigator", {
      language: "es-CR",
      languages: ["es-CR", "en"],
    });
    expect(browserLocale()).toBe("es");
  });

  it("falls back when languages is absent", () => {
    vi.stubGlobal("navigator", { language: "en-US" });
    expect(browserLocale()).toBe("en");
  });
});
