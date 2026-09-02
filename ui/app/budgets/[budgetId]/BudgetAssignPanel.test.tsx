/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { listsMessages } from "@/lib/i18n/lists";

import { BudgetAssignPanel } from "./BudgetAssignPanel";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock("@/app/lists/Sheet.module.scss", () => ({
  default: new Proxy(
    {},
    {
      get: (_t, prop) => String(prop),
    },
  ),
}));

vi.mock("@/components/IconButton/IconButton.module.scss", () => ({
  default: new Proxy(
    {},
    {
      get: (_t, prop) => String(prop),
    },
  ),
}));

const fetchCandidates = vi.fn();
const assignEntry = vi.fn();

vi.mock("./budgetDetailClient", async () => {
  const actual = await vi.importActual<typeof import("./budgetDetailClient")>(
    "./budgetDetailClient",
  );
  return {
    ...actual,
    fetchCandidates: (...args: unknown[]) => fetchCandidates(...args),
    assignEntry: (...args: unknown[]) => assignEntry(...args),
  };
});

const messages = {
  budgetsAssignTitle: listsMessages.en.budgetsAssignTitle,
  budgetsAssignEmpty: listsMessages.en.budgetsAssignEmpty,
  budgetsAssignSubmit: listsMessages.en.budgetsAssignSubmit,
  budgetsAssigning: listsMessages.en.budgetsAssigning,
  cancelLabel: listsMessages.en.receiptMoveCancel,
  errorGeneric: listsMessages.en.errorGeneric,
  errorUnauthorized: listsMessages.en.errorUnauthorized,
  errorInvalidBudgetRuleMatchText: listsMessages.en.errorInvalidBudgetRuleMatchText,
  errorBudgetEntryNotFound: listsMessages.en.errorBudgetEntryNotFound,
  errorBudgetRuleNotFound: listsMessages.en.errorBudgetRuleNotFound,
};

describe("BudgetAssignPanel", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    refresh.mockReset();
    fetchCandidates.mockReset();
    assignEntry.mockReset();
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

  it("opening the picker calls fetchCandidates for the budget", async () => {
    fetchCandidates.mockResolvedValue({
      ok: true,
      candidates: [
        { id: "e1", description: "Automercado", posted_date: "2026-08-10", amount_crc: "10.00" },
      ],
    });

    act(() => {
      root.render(<BudgetAssignPanel budgetId="b1" messages={messages} />);
    });

    const open = container.querySelector("button") as HTMLButtonElement;
    await act(async () => {
      open.click();
    });

    expect(fetchCandidates).toHaveBeenCalledWith("b1", messages);
    expect(document.body.textContent).toContain("Automercado");
  });

  it("selecting and confirming calls assignEntry with the right body, closes, and refreshes", async () => {
    fetchCandidates.mockResolvedValue({
      ok: true,
      candidates: [
        { id: "e1", description: "Automercado", posted_date: "2026-08-10", amount_crc: "10.00" },
      ],
    });
    assignEntry.mockResolvedValue({ ok: true });

    act(() => {
      root.render(<BudgetAssignPanel budgetId="b1" messages={messages} />);
    });

    const open = container.querySelector("button") as HTMLButtonElement;
    await act(async () => {
      open.click();
    });

    const candidate = Array.from(document.querySelectorAll("button")).find((el) =>
      el.textContent?.includes("Automercado"),
    ) as HTMLButtonElement;
    await act(async () => {
      candidate.click();
    });

    const confirm = Array.from(document.querySelectorAll("button")).find(
      (el) => el.textContent === messages.budgetsAssignSubmit,
    ) as HTMLButtonElement;
    await act(async () => {
      confirm.click();
    });

    expect(assignEntry).toHaveBeenCalledWith("b1", "e1", messages);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
