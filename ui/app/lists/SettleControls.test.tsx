/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SettleControls } from "./SettleControls";

vi.mock("@/components/IconButton/IconButton.module.scss", () => ({
  default: new Proxy({}, { get: (_t, prop) => String(prop) }),
}));

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

const messages = {
  simplifyAction: "Simplify",
  simplifyTitle: "Group transfer plan",
  simplifyEmpty: "Already minimal — no transfers needed.",
  simplifyBlocked: "Simplify is unavailable until unresolved items are settled.",
  settleAction: "Settle",
  settleConfirmTitle: "Settle your side?",
  settleConfirmBody: "This marks what you owe as done for you.",
  settleConfirmAction: "I've settled my side",
  settleCancel: "Cancel",
  copyPlanLabel: "Copy plan",
  copyPlanCopiedLabel: "Copied",
  errorGeneric: "Something went wrong. Try again.",
};

function jsonResponse(status: number, body: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  } as Response;
}

describe("SettleControls", () => {
  let container: HTMLDivElement;
  let root: Root;
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    refresh.mockReset();
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

  it("hides the Simplify button when simplifyAvailable is false (AC #5)", () => {
    act(() => {
      root.render(
        <SettleControls listId="list-1" messages={messages} simplifyAvailable={false} />,
      );
    });
    const buttons = Array.from(container.querySelectorAll("button")).map((b) => b.textContent);
    expect(buttons).not.toContain("Simplify");
    expect(buttons).toContain("Settle");
  });

  it("fetches and renders the plan on Simplify click", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        transfers: [
          { from_member_id: "a", from_alias: "Alice", to_member_id: "b", to_alias: "Bob", amount_crc: "500.00" },
        ],
        is_incomplete: false,
      }),
    );
    act(() => {
      root.render(<SettleControls listId="list-1" messages={messages} simplifyAvailable={true} />);
    });
    const simplifyButton = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Simplify",
    ) as HTMLButtonElement;
    await act(async () => {
      simplifyButton.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/lists/list-1/settle/simplify",
      expect.objectContaining({ method: "GET" }),
    );
    expect(container.textContent).toContain("Alice");
    expect(container.textContent).toContain("Bob");
  });

  it("shows the blocked message on a 409 response, never a crash (AC #5)", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(409, { detail: "blocked", code: "settle_incomplete" }),
    );
    act(() => {
      root.render(<SettleControls listId="list-1" messages={messages} simplifyAvailable={true} />);
    });
    const simplifyButton = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Simplify",
    ) as HTMLButtonElement;
    await act(async () => {
      simplifyButton.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain(messages.simplifyBlocked);
  });

  it("Settle confirm posts to /settle and refreshes on success", async () => {
    fetchMock.mockResolvedValueOnce({ status: 204, ok: true, json: async () => null } as Response);
    act(() => {
      root.render(<SettleControls listId="list-1" messages={messages} simplifyAvailable={true} />);
    });
    const settleButton = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Settle",
    ) as HTMLButtonElement;
    act(() => {
      settleButton.click();
    });
    expect(document.body.textContent).toContain(messages.settleConfirmTitle);
    const confirmButton = Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent === messages.settleConfirmAction,
    ) as HTMLButtonElement;
    await act(async () => {
      confirmButton.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/lists/list-1/settle",
      expect.objectContaining({ method: "POST" }),
    );
    expect(refresh).toHaveBeenCalled();
  });
});
