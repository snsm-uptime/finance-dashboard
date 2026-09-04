/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GhostBudgetCard, type GhostBudgetCardMessages } from "./GhostBudgetCard";
import type { BudgetItem } from "./budgetsClient";

const createBudgetMock = vi.fn();
vi.mock("./budgetsClient", async () => {
  const actual = await vi.importActual<typeof import("./budgetsClient")>("./budgetsClient");
  return {
    ...actual,
    createBudget: (...args: unknown[]) => createBudgetMock(...args),
  };
});

const messages: GhostBudgetCardMessages = {
  errorGeneric: "Something went wrong.",
  errorUnauthorized: "unauthorized",
  errorInvalidBudgetName: "invalid-name",
  errorInvalidBudgetCap: "invalid-cap",
  errorInvalidBudgetCurrency: "invalid-currency",
  errorInvalidBudgetSourceLists: "Select at least one source list.",
  errorInvalidBudgetPeriod: "invalid-period",
  errorForbidden: "forbidden",
  budgetsNameLabel: "Name",
  budgetsCapLabel: "Cap",
  budgetsCurrencyLabel: "Currency",
  budgetsSourceListsLabel: "Source lists",
  budgetsAddListTrigger: "+ Add list",
  budgetsCreateSubmit: "Create budget",
  budgetsCreating: "Creating…",
  budgetsPeriodStartLabel: "From (optional)",
  budgetsPeriodEndLabel: "To (optional)",
  budgetsPeriodTriggerLabel: "Set budget period",
  budgetsDateFrom: "From",
  budgetsDateTo: "To (optional)",
  budgetsDateClear: "Clear",
  budgetsDaysLeft: "days left",
  budgetsDaysOverdue: "days overdue",
};

const lists = [
  { id: "l1", name: "Groceries List", owner_id: "u1", role: "owner" },
  { id: "l2", name: "Roommates List", owner_id: "u1", role: "owner" },
];

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("GhostBudgetCard", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    createBudgetMock.mockReset();
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

  async function render(onCreated: (budget: BudgetItem) => void = vi.fn()) {
    await act(async () => {
      root.render(
        <GhostBudgetCard lists={lists} messages={messages} locale="en" onCreated={onCreated} />,
      );
    });
  }

  function addListChip(listName: string) {
    const trigger = Array.from(container.querySelectorAll("button")).find((el) =>
      el.textContent?.includes("+ Add list"),
    ) as HTMLButtonElement;
    trigger.click();
    const option = Array.from(container.querySelectorAll("button")).find(
      (el) => el.textContent === listName,
    ) as HTMLButtonElement;
    option.click();
  }

  it("renders a dashed card shell with name/cap placeholders and a disabled submit badge", async () => {
    await render();
    const nameInput = container.querySelector('input[placeholder="Name"]') as HTMLInputElement;
    const capInput = container.querySelector('input[placeholder="Cap"]') as HTMLInputElement;
    const submitButton = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(nameInput).not.toBeNull();
    expect(capInput).not.toBeNull();
    expect(submitButton.disabled).toBe(true);
    expect(container.querySelector("form")?.className).toContain("border-dashed");
  });

  it("shows the calendar-icon trigger before a period is chosen", async () => {
    await render();
    expect(container.querySelector('button[aria-label="Set budget period"]')).not.toBeNull();
    expect(container.textContent).not.toContain("days left");
  });

  it("enables the submit badge once name, cap, and a source list are set", async () => {
    await render();
    const nameInput = container.querySelector('input[placeholder="Name"]') as HTMLInputElement;
    const capInput = container.querySelector('input[placeholder="Cap"]') as HTMLInputElement;
    const submitButton = container.querySelector('button[type="submit"]') as HTMLButtonElement;

    await act(async () => {
      setInputValue(nameInput, "Groceries");
      setInputValue(capInput, "500.00");
    });
    expect(submitButton.disabled).toBe(true);

    await act(async () => {
      addListChip("Groceries List");
    });
    expect(submitButton.disabled).toBe(false);
  });

  it("submits the selected source list ids and resets the card on success", async () => {
    const created: BudgetItem = {
      id: "b1",
      name: "Groceries",
      cap: "500.00",
      currency: "CRC",
      spent: "0",
      state: "ok",
      source_list_ids: ["l1"],
      period_start: null,
      period_end: null,
      created_at: "2026-08-01T00:00:00Z",
      is_archived: false,
    };
    createBudgetMock.mockResolvedValue({ ok: true, budget: created });
    const onCreated = vi.fn();
    await render(onCreated);

    const nameInput = container.querySelector('input[placeholder="Name"]') as HTMLInputElement;
    const capInput = container.querySelector('input[placeholder="Cap"]') as HTMLInputElement;
    await act(async () => {
      setInputValue(nameInput, "Groceries");
      setInputValue(capInput, "500.00");
      addListChip("Groceries List");
    });

    const form = container.querySelector("form") as HTMLFormElement;
    await act(async () => {
      form.requestSubmit();
    });

    expect(createBudgetMock).toHaveBeenCalledWith(
      {
        name: "Groceries",
        cap: "500.00",
        currency: "CRC",
        source_list_ids: ["l1"],
        period_start: null,
        period_end: null,
      },
      messages,
    );
    expect(onCreated).toHaveBeenCalledWith(created);
    expect((container.querySelector('input[placeholder="Name"]') as HTMLInputElement).value).toBe("");
  });

  it("submits both period fields once a range is picked, and the trigger morphs into a day count", async () => {
    vi.setSystemTime(new Date("2026-01-15T12:00:00"));
    createBudgetMock.mockResolvedValue({
      ok: true,
      budget: {
        id: "b1",
        name: "Groceries",
        cap: "500.00",
        currency: "CRC",
        spent: "0",
        state: "ok",
        source_list_ids: ["l1"],
        period_start: "2026-01-01",
        period_end: "2026-01-31",
        created_at: "2026-08-01T00:00:00Z",
      },
    });
    await render();

    const nameInput = container.querySelector('input[placeholder="Name"]') as HTMLInputElement;
    const capInput = container.querySelector('input[placeholder="Cap"]') as HTMLInputElement;
    await act(async () => {
      setInputValue(nameInput, "Groceries");
      setInputValue(capInput, "500.00");
      addListChip("Groceries List");
    });

    function inMonthDay(day: string): HTMLButtonElement {
      return Array.from(container.querySelectorAll("button")).find(
        (el) => el.textContent === day && el.className.includes("text-foreground"),
      ) as HTMLButtonElement;
    }

    const calendarTrigger = container.querySelector(
      'button[aria-label="Set budget period"]',
    ) as HTMLButtonElement;
    await act(async () => {
      calendarTrigger.click();
    });
    await act(async () => {
      inMonthDay("1").click();
    });
    await act(async () => {
      inMonthDay("31").click();
    });

    expect(container.textContent).toContain("days left");
    expect(container.querySelector('button[aria-label="Set budget period"]')?.textContent).toContain(
      "16",
    );

    const form = container.querySelector("form") as HTMLFormElement;
    await act(async () => {
      form.requestSubmit();
    });

    expect(createBudgetMock).toHaveBeenCalledWith(
      expect.objectContaining({ period_start: "2026-01-01", period_end: "2026-01-31" }),
      messages,
    );
    vi.useRealTimers();
  });

  it("shows the source-lists error message when the submission is rejected", async () => {
    createBudgetMock.mockResolvedValue({ ok: false, error: messages.errorInvalidBudgetSourceLists });
    await render();

    const nameInput = container.querySelector('input[placeholder="Name"]') as HTMLInputElement;
    const capInput = container.querySelector('input[placeholder="Cap"]') as HTMLInputElement;
    await act(async () => {
      setInputValue(nameInput, "Groceries");
      setInputValue(capInput, "500.00");
      addListChip("Groceries List");
    });

    const form = container.querySelector("form") as HTMLFormElement;
    await act(async () => {
      form.requestSubmit();
    });

    expect(container.textContent).toContain(messages.errorInvalidBudgetSourceLists);
  });
});
