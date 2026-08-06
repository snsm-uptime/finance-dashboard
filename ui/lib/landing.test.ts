import { describe, expect, it } from "vitest";

import { resolveAuthenticatedLanding } from "./landing";

describe("resolveAuthenticatedLanding", () => {
  it("defaults to Lists homepage", () => {
    expect(resolveAuthenticatedLanding()).toBe("/lists");
  });

  it("prefers invite deep link for Story 2.4", () => {
    expect(
      resolveAuthenticatedLanding({
        inviteListId: "invite-list",
        lastOpenedListId: "old",
        lastOpenedStillAccessible: true,
      }),
    ).toBe("/lists/invite-list");
  });

  it("uses remembered list only when still accessible via ACL", () => {
    expect(
      resolveAuthenticatedLanding({
        lastOpenedListId: "abc",
        lastOpenedStillAccessible: true,
      }),
    ).toBe("/lists/abc");
    expect(
      resolveAuthenticatedLanding({
        lastOpenedListId: "abc",
        lastOpenedStillAccessible: false,
      }),
    ).toBe("/lists");
  });
});
