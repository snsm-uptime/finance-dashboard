import { describe, expect, it } from "vitest";

import { orderPercentageSplitUserIds } from "./orderPercentageSplitUserIds";

describe("orderPercentageSplitUserIds", () => {
  it("puts the current user first and keeps the rest in original order", () => {
    expect(
      orderPercentageSplitUserIds(["owner", "alice", "bob"], "bob"),
    ).toEqual(["bob", "owner", "alice"]);
  });

  it("is a no-op when the current user is already first", () => {
    expect(
      orderPercentageSplitUserIds(["me", "them"], "me"),
    ).toEqual(["me", "them"]);
  });

  it("leaves order unchanged when the current user is not in the list", () => {
    expect(
      orderPercentageSplitUserIds(["a", "b"], "missing"),
    ).toEqual(["a", "b"]);
  });

  it("returns an empty list unchanged", () => {
    expect(orderPercentageSplitUserIds([], "me")).toEqual([]);
  });
});
