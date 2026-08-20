import { afterEach, describe, expect, it } from "vitest";

import { getApiInternalUrl } from "./api";

describe("getApiInternalUrl", () => {
  const previous = process.env.API_INTERNAL_URL;

  afterEach(() => {
    if (previous === undefined) {
      delete process.env.API_INTERNAL_URL;
    } else {
      process.env.API_INTERNAL_URL = previous;
    }
  });

  it("strips a trailing slash from the configured origin", () => {
    process.env.API_INTERNAL_URL = "http://api.test:8000/";
    expect(getApiInternalUrl()).toBe("http://api.test:8000");
  });

  it("falls back to loopback when unset", () => {
    delete process.env.API_INTERNAL_URL;
    expect(getApiInternalUrl()).toBe("http://127.0.0.1:8000");
  });

  it("falls back when the value is only whitespace", () => {
    process.env.API_INTERNAL_URL = "   ";
    expect(getApiInternalUrl()).toBe("http://127.0.0.1:8000");
  });
});
