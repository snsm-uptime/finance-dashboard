import { describe, expect, it } from "vitest";

import { balanceTone, formatCardBalance } from "./listsClient";

describe("balanceTone", () => {
  it("classifies owe / owed / zero tokens", () => {
    expect(balanceTone("-12.50")).toBe("owe");
    expect(balanceTone("15")).toBe("owed");
    expect(balanceTone("0")).toBe("zero");
    expect(balanceTone(undefined)).toBe("zero");
  });
});

describe("formatCardBalance", () => {
  it("formats an absolute CRC amount", () => {
    expect(formatCardBalance("-12.50")).toBe("₡12.5");
    expect(formatCardBalance("1500")).toBe("₡1,500");
  });
});
