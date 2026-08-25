import { describe, expect, it } from "vitest";

import { showsAppChrome, tabKeyFromPath } from "./appChrome";

describe("showsAppChrome", () => {
  it("keeps the tab bar on authenticated product surfaces", () => {
    expect(showsAppChrome("/home")).toBe(true);
    expect(showsAppChrome("/lists/abc")).toBe(true);
    expect(showsAppChrome("/upload")).toBe(true);
    expect(showsAppChrome("/account")).toBe(true);
  });

  it("hides the tab bar on auth and setup routes", () => {
    expect(showsAppChrome("/")).toBe(false);
    expect(showsAppChrome("/sign-in")).toBe(false);
    expect(showsAppChrome("/signup")).toBe(false);
    expect(showsAppChrome("/alias")).toBe(false);
    expect(showsAppChrome("/invites/accept")).toBe(false);
    expect(showsAppChrome("/forgot-password")).toBe(false);
    expect(showsAppChrome("/cards")).toBe(false);
  });
});

describe("tabKeyFromPath", () => {
  it("marks Home active on home and list detail", () => {
    expect(tabKeyFromPath("/home")).toBe("home");
    expect(tabKeyFromPath("/lists/abc")).toBe("home");
  });

  it("marks Upload and Account from their routes", () => {
    expect(tabKeyFromPath("/upload")).toBe("upload");
    expect(tabKeyFromPath("/account")).toBe("account");
  });
});
