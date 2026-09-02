/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { listsMessages } from "@/lib/i18n/lists";

import { UnassignButton } from "./UnassignButton";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

const unassignEntry = vi.fn();

vi.mock("./budgetDetailClient", async () => {
  const actual = await vi.importActual<typeof import("./budgetDetailClient")>(
    "./budgetDetailClient",
  );
  return {
    ...actual,
    unassignEntry: (...args: unknown[]) => unassignEntry(...args),
  };
});

const messages = {
  errorGeneric: listsMessages.en.errorGeneric,
  errorUnauthorized: listsMessages.en.errorUnauthorized,
  errorInvalidBudgetRuleMatchText: listsMessages.en.errorInvalidBudgetRuleMatchText,
  errorBudgetEntryNotFound: listsMessages.en.errorBudgetEntryNotFound,
  errorBudgetRuleNotFound: listsMessages.en.errorBudgetRuleNotFound,
};

describe("UnassignButton", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    refresh.mockReset();
    unassignEntry.mockReset();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("clicking calls unassignEntry and refreshes on success", async () => {
    unassignEntry.mockResolvedValue({ ok: true });

    act(() => {
      root.render(
        <UnassignButton budgetId="b1" entryId="e1" label="Unassign" messages={messages} />,
      );
    });

    const button = container.querySelector("button") as HTMLButtonElement;
    await act(async () => {
      button.click();
    });

    expect(unassignEntry).toHaveBeenCalledWith("b1", "e1", messages);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("a failure response renders the mapped error text and does not refresh", async () => {
    unassignEntry.mockResolvedValue({ ok: false, error: messages.errorBudgetEntryNotFound });

    act(() => {
      root.render(
        <UnassignButton budgetId="b1" entryId="e1" label="Unassign" messages={messages} />,
      );
    });

    const button = container.querySelector("button") as HTMLButtonElement;
    await act(async () => {
      button.click();
    });

    expect(container.querySelector("[role='alert']")?.textContent).toBe(
      messages.errorBudgetEntryNotFound,
    );
    expect(refresh).not.toHaveBeenCalled();
  });
});
