import { describe, expect, it } from "vitest";

import { buildHealthPayload, isHealthy } from "../lib/health";

describe("health helpers", () => {
  it("builds an ok payload", () => {
    expect(buildHealthPayload()).toEqual({ status: "ok" });
  });

  it("recognizes a healthy payload", () => {
    expect(isHealthy({ status: "ok" })).toBe(true);
  });

  it("rejects nullish payloads", () => {
    expect(isHealthy(null)).toBe(false);
    expect(isHealthy(undefined)).toBe(false);
  });
});
