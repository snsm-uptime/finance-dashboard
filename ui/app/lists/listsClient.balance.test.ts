import { describe, expect, it } from "vitest";

import { balanceTone } from "./listsClient";

describe("balanceTone", () => {
  it("classifies owe / owed / zero tokens", () => {
    expect(balanceTone("-12.50")).toBe("owe");
    expect(balanceTone("15")).toBe("owed");
    expect(balanceTone("0")).toBe("zero");
    expect(balanceTone(undefined)).toBe("zero");
  });
});
