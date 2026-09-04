/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { listsMessages } from "@/lib/i18n/lists";
import type { BudgetItem } from "../budgetsClient";

import { BudgetUpdateForm } from "./BudgetUpdateForm";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock("@/app/lists/Sheet.module.scss", () => ({
  default: new Proxy({}, { get: (_t, prop) => String(prop) }),
}));

vi.mock("@/components/IconButton/IconButton.module.scss", () => ({
  default: new Proxy({}, { get: (_t, prop) => String(prop) }),
}));

vi.mock("@/components/FormIconSubmit/FormIconSubmit.module.scss", () => ({
  default: new Proxy({}, { get: (_t, prop) => String(prop) }),
}));

const updateBudgetMock = vi.fn();

vi.mock("../budgetsClient", async () => {
  const actual = await vi.importActual<typeof import("../budgetsClient")>("../budgetsClient");
  return {
    ...actual,
    updateBudget: (...args: unknown[]) => updateBudgetMock(...args),
  };
});

const t = listsMessages.en;
const messages = {
  ...t,
  cancelLabel: t.receiptMoveCancel,
};

const budget: BudgetItem = {
  id: "b1",
  name: "Groceries",
  cap: "500.00",
  currency: "CRC",
  spent: "10.00",
  state: "ok",
  source_list_ids: ["l1"],
  period_start: "2026-01-01",
  period_end: "2026-01-31",
  created_at: "2026-08-01T00:00:00Z",
};

const lists = [{ id: "l1", name: "Groceries List" }];

describe("BudgetUpdateForm", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    refresh.mockReset();
    updateBudgetMock.mockReset();
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

  function openEditor() {
    const openButton = container.querySelector("button") as HTMLButtonElement;
    return act(async () => {
      openButton.click();
    });
  }

  it("opening the editor pre-fills the form from the budget prop", async () => {
    act(() => {
      root.render(<BudgetUpdateForm budget={budget} lists={lists} messages={messages} locale="en" />);
    });
    await openEditor();

    const nameInput = document.querySelector(
      `input[placeholder="${t.budgetsNameLabel}"]`,
    ) as HTMLInputElement;
    expect(nameInput.value).toBe("Groceries");
  });

  it("submitting without a period conflict updates the budget directly and refreshes", async () => {
    updateBudgetMock.mockResolvedValue({ ok: true, budget: { ...budget, name: "New name" } });
    act(() => {
      root.render(<BudgetUpdateForm budget={budget} lists={lists} messages={messages} locale="en" />);
    });
    await openEditor();

    const form = document.querySelector("form") as HTMLFormElement;
    await act(async () => {
      form.requestSubmit();
    });

    expect(updateBudgetMock).toHaveBeenCalledWith(
      "b1",
      expect.objectContaining({ confirm_period_change: false }),
      messages,
    );
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("a narrowing period-change 422 opens the confirmation Sheet listing the excluded lines", async () => {
    updateBudgetMock.mockResolvedValue({
      ok: false,
      requiresConfirmation: true,
      excludedLines: [
        { id: "e1", description: "Automercado", posted_date: "2026-01-05", amount_crc: "10.00" },
      ],
    });
    act(() => {
      root.render(<BudgetUpdateForm budget={budget} lists={lists} messages={messages} locale="en" />);
    });
    await openEditor();

    const form = document.querySelector("form") as HTMLFormElement;
    await act(async () => {
      form.requestSubmit();
    });

    expect(document.body.textContent).toContain("Automercado");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("confirming the period change resubmits with confirm_period_change=true and refreshes", async () => {
    updateBudgetMock
      .mockResolvedValueOnce({
        ok: false,
        requiresConfirmation: true,
        excludedLines: [
          { id: "e1", description: "Automercado", posted_date: "2026-01-05", amount_crc: "10.00" },
        ],
      })
      .mockResolvedValueOnce({ ok: true, budget });
    act(() => {
      root.render(<BudgetUpdateForm budget={budget} lists={lists} messages={messages} locale="en" />);
    });
    await openEditor();

    const form = document.querySelector("form") as HTMLFormElement;
    await act(async () => {
      form.requestSubmit();
    });

    const confirmButton = Array.from(document.querySelectorAll("button")).find((el) =>
      el.getAttribute("aria-label")?.startsWith(t.budgetsPeriodChangeConfirmAction),
    ) as HTMLButtonElement;
    await act(async () => {
      confirmButton.click();
    });

    expect(updateBudgetMock).toHaveBeenLastCalledWith(
      "b1",
      expect.objectContaining({ confirm_period_change: true }),
      messages,
    );
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
