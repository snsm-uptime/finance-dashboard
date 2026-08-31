/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SimplifyColumn } from "./SimplifyColumn";

const messages = {
  title: "Group transfer plan",
  emptyLabel: "Already minimal — no transfers needed.",
  copyLabel: "Copy plan",
  copiedLabel: "Copied",
  blockedLabel: "Simplify is unavailable until unresolved items are settled.",
  errorGeneric: "Something went wrong. Try again.",
};

function jsonResponse(status: number, body: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  } as Response;
}

describe("SimplifyColumn", () => {
  let container: HTMLDivElement;
  let root: Root;
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
  });

  it("fetches on mount with no load-trigger button, then renders behind the title disclosure", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        transfers: [
          { from_member_id: "a", from_alias: "Alice", to_member_id: "b", to_alias: "Bob", amount_crc: "500.00" },
        ],
      }),
    );
    await act(async () => {
      root.render(<SimplifyColumn listId="list-1" available messages={messages} />);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/lists/list-1/settle/simplify",
      expect.objectContaining({ method: "GET" }),
    );
    // The only buttons are the title disclosure toggle and the Copy action —
    // nothing the user has to click before the plan is fetched.
    const loadTriggerButtons = Array.from(container.querySelectorAll("button")).filter(
      (b) => b.getAttribute("aria-label") !== messages.copyLabel && !b.textContent?.includes(messages.title),
    );
    expect(loadTriggerButtons).toHaveLength(0);
    expect(container.textContent).toContain("Alice");
    expect(container.textContent).toContain("Bob");
  });

  it("shows the blocked message without fetching when unavailable (AC #5)", async () => {
    await act(async () => {
      root.render(<SimplifyColumn listId="list-1" available={false} messages={messages} />);
      await Promise.resolve();
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(container.textContent).toContain(messages.blockedLabel);
  });

  it("shows the blocked message on a 409 response, never a crash (AC #5)", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(409, { detail: "blocked", code: "settle_incomplete" }));
    await act(async () => {
      root.render(<SimplifyColumn listId="list-1" available messages={messages} />);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain(messages.blockedLabel);
  });

  it("shows a generic error on a malformed response", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { nope: true }));
    await act(async () => {
      root.render(<SimplifyColumn listId="list-1" available messages={messages} />);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain(messages.errorGeneric);
  });
});
