/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { listsMessages } from "@/lib/i18n/lists";

import { BudgetRulesPanel } from "./BudgetRulesPanel";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

const createRule = vi.fn();
const deleteRule = vi.fn();

vi.mock("./budgetDetailClient", async () => {
  const actual = await vi.importActual<typeof import("./budgetDetailClient")>(
    "./budgetDetailClient",
  );
  return {
    ...actual,
    createRule: (...args: unknown[]) => createRule(...args),
    deleteRule: (...args: unknown[]) => deleteRule(...args),
  };
});

const messages = {
  budgetsRulesTitle: listsMessages.en.budgetsRulesTitle,
  budgetsRulesEmpty: listsMessages.en.budgetsRulesEmpty,
  budgetsRuleMatchLabel: listsMessages.en.budgetsRuleMatchLabel,
  budgetsRuleAddSubmit: listsMessages.en.budgetsRuleAddSubmit,
  budgetsRuleAdding: listsMessages.en.budgetsRuleAdding,
  budgetsRuleDelete: listsMessages.en.budgetsRuleDelete,
  errorGeneric: listsMessages.en.errorGeneric,
  errorUnauthorized: listsMessages.en.errorUnauthorized,
  errorInvalidBudgetRuleMatchText: listsMessages.en.errorInvalidBudgetRuleMatchText,
  errorBudgetEntryNotFound: listsMessages.en.errorBudgetEntryNotFound,
  errorBudgetRuleNotFound: listsMessages.en.errorBudgetRuleNotFound,
};

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("BudgetRulesPanel", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    refresh.mockReset();
    createRule.mockReset();
    deleteRule.mockReset();
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

  it("submitting the rule form calls createRule, clears the input, and refreshes on success", async () => {
    createRule.mockResolvedValue({
      ok: true,
      rule: { id: "r1", match_text: "uber", created_at: "2026-08-01T00:00:00Z" },
    });

    act(() => {
      root.render(<BudgetRulesPanel budgetId="b1" rules={[]} messages={messages} />);
    });

    const input = container.querySelector("input") as HTMLInputElement;
    await act(async () => {
      setInputValue(input, "uber");
    });
    const form = container.querySelector("form") as HTMLFormElement;
    await act(async () => {
      form.requestSubmit();
    });

    expect(createRule).toHaveBeenCalledWith("b1", "uber", messages);
    expect(input.value).toBe("");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("clicking delete on a rendered rule calls deleteRule and refreshes on success", async () => {
    deleteRule.mockResolvedValue({ ok: true });

    act(() => {
      root.render(
        <BudgetRulesPanel
          budgetId="b1"
          rules={[{ id: "r1", match_text: "uber", created_at: "2026-08-01T00:00:00Z" }]}
          messages={messages}
        />,
      );
    });

    const del = Array.from(container.querySelectorAll("button")).find(
      (el) => el.textContent === messages.budgetsRuleDelete,
    ) as HTMLButtonElement;
    await act(async () => {
      del.click();
    });

    expect(deleteRule).toHaveBeenCalledWith("b1", "r1", messages);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("a validation error renders the mapped message without refreshing", async () => {
    createRule.mockResolvedValue({
      ok: false,
      error: messages.errorInvalidBudgetRuleMatchText,
    });

    act(() => {
      root.render(<BudgetRulesPanel budgetId="b1" rules={[]} messages={messages} />);
    });

    const input = container.querySelector("input") as HTMLInputElement;
    await act(async () => {
      setInputValue(input, "x".repeat(101));
    });
    const form = container.querySelector("form") as HTMLFormElement;
    await act(async () => {
      form.requestSubmit();
    });

    expect(container.querySelector("[role='alert']")?.textContent).toBe(
      messages.errorInvalidBudgetRuleMatchText,
    );
    expect(refresh).not.toHaveBeenCalled();
  });
});
