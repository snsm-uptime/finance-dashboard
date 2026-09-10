/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { listsMessages } from "@/lib/i18n/lists";

import { DeleteBudgetButton } from "./DeleteBudgetButton";

const refresh = vi.fn();
const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push }),
}));

vi.mock("@/components/IconButton/IconButton.module.scss", () => ({
  default: new Proxy({}, { get: (_t, prop) => String(prop) }),
}));

const deleteBudgetMock = vi.fn();

vi.mock("../budgetsClient", async () => {
  const actual = await vi.importActual<typeof import("../budgetsClient")>("../budgetsClient");
  return {
    ...actual,
    deleteBudget: (...args: unknown[]) => deleteBudgetMock(...args),
  };
});

const t = listsMessages.en;
const messages = { ...t, cancelLabel: t.receiptMoveCancel };

describe("DeleteBudgetButton", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    refresh.mockReset();
    push.mockReset();
    deleteBudgetMock.mockReset();
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

  function openConfirm() {
    const trigger = container.querySelector("button") as HTMLButtonElement;
    return act(async () => {
      trigger.click();
    });
  }

  function findButton(name: string) {
    return Array.from(document.querySelectorAll("button")).find(
      (el) => el.textContent === name,
    ) as HTMLButtonElement;
  }

  it("clicking the trash icon shows a popup confirmation before deleting anything", async () => {
    act(() => {
      root.render(<DeleteBudgetButton budgetId="b1" messages={messages} />);
    });
    await openConfirm();

    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(document.body.textContent).toContain(t.budgetsDeleteConfirmBody);
    expect(deleteBudgetMock).not.toHaveBeenCalled();
  });

  it("confirming deletes the budget and navigates to /budgets", async () => {
    deleteBudgetMock.mockResolvedValue({ ok: true });
    act(() => {
      root.render(<DeleteBudgetButton budgetId="b1" messages={messages} />);
    });
    await openConfirm();

    await act(async () => {
      findButton(t.budgetsDeleteConfirmAction).click();
    });

    expect(deleteBudgetMock).toHaveBeenCalledWith("b1", messages);
    expect(push).toHaveBeenCalledWith("/budgets");
  });

  it("a failed delete keeps the popup open and appends the error, without navigating", async () => {
    deleteBudgetMock.mockResolvedValue({ ok: false, error: "boom" });
    act(() => {
      root.render(<DeleteBudgetButton budgetId="b1" messages={messages} />);
    });
    await openConfirm();

    await act(async () => {
      findButton(t.budgetsDeleteConfirmAction).click();
    });

    expect(push).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("boom");
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it("cancelling the popup closes it without deleting", async () => {
    act(() => {
      root.render(<DeleteBudgetButton budgetId="b1" messages={messages} />);
    });
    await openConfirm();

    await act(async () => {
      findButton(messages.cancelLabel).click();
    });

    expect(deleteBudgetMock).not.toHaveBeenCalled();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("the confirm action is disabled while the delete is in flight", async () => {
    let resolveDelete: (value: { ok: true }) => void = () => {};
    deleteBudgetMock.mockReturnValue(
      new Promise((resolve) => {
        resolveDelete = resolve;
      }),
    );
    act(() => {
      root.render(<DeleteBudgetButton budgetId="b1" messages={messages} />);
    });
    await openConfirm();

    act(() => {
      findButton(t.budgetsDeleteConfirmAction).click();
    });

    expect(findButton(t.budgetsDeleting).disabled).toBe(true);

    await act(async () => {
      resolveDelete({ ok: true });
    });
  });
});
