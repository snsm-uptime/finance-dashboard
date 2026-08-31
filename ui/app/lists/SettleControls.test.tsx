/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SettleControls } from "./SettleControls";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

const messages = {
  settleAction: "Settle",
  settleConfirmTitle: "Settle your side?",
  settleConfirmBody: "This marks what you owe as done for you.",
  settleConfirmAction: "I've settled my side",
  settleCancel: "Cancel",
  errorGeneric: "Something went wrong. Try again.",
};

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

  it("renders a full-width Settle button", () => {
    act(() => {
      root.render(<SettleControls listId="list-1" messages={messages} />);
    });
    const button = container.querySelector("button") as HTMLButtonElement;
    expect(button.textContent).toContain("Settle");
    expect(button.className).toContain("w-full");
  });

  it("Settle confirm posts to /settle and refreshes on success", async () => {
    fetchMock.mockResolvedValueOnce({ status: 204, ok: true, json: async () => null } as Response);
    act(() => {
      root.render(<SettleControls listId="list-1" messages={messages} />);
    });
    const settleButton = container.querySelector("button") as HTMLButtonElement;
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
