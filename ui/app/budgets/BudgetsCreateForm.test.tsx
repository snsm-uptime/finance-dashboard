/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BudgetsCreateForm, type BudgetsCreateFormMessages } from "./BudgetsCreateForm";
import type { BudgetItem } from "./budgetsClient";

const createBudgetMock = vi.fn();
vi.mock("./budgetsClient", async () => {
  const actual = await vi.importActual<typeof import("./budgetsClient")>("./budgetsClient");
  return {
    ...actual,
    createBudget: (...args: unknown[]) => createBudgetMock(...args),
  };
});

const messages: BudgetsCreateFormMessages = {
  errorGeneric: "Something went wrong.",
  errorUnauthorized: "unauthorized",
  errorInvalidBudgetName: "invalid-name",
  errorInvalidBudgetCap: "invalid-cap",
  errorInvalidBudgetCurrency: "invalid-currency",
  errorInvalidBudgetSourceLists: "Select at least one source list.",
  errorInvalidBudgetPeriod: "invalid-period",
  errorForbidden: "forbidden",
  budgetsCreateTitle: "New budget",
  budgetsNameLabel: "Name",
  budgetsCapLabel: "Cap",
  budgetsCurrencyLabel: "Currency",
  budgetsSourceListsLabel: "Source lists",
  budgetsCreateSubmit: "Create budget",
  budgetsCreating: "Creating…",
  budgetsPeriodStartLabel: "From (optional)",
  budgetsPeriodEndLabel: "To (optional)",
};

const lists = [
  { id: "l1", name: "Groceries List", owner_id: "u1", role: "owner" },
  { id: "l2", name: "Roommates List", owner_id: "u1", role: "owner" },
];

describe("BudgetsCreateForm", () => {
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
      root.render(<BudgetsCreateForm lists={lists} messages={messages} onCreated={onCreated} />);
    });
  }

  function chipFor(listName: string): HTMLButtonElement {
    return Array.from(container.querySelectorAll('button[aria-pressed]')).find((el) =>
      el.textContent?.includes(listName),
    ) as HTMLButtonElement;
  }

  it("renders one toggle chip per source list from the lists prop", async () => {
    await render();
    expect(chipFor("Groceries List")).not.toBeNull();
    expect(chipFor("Roommates List")).not.toBeNull();
    expect(chipFor("Groceries List").getAttribute("aria-pressed")).toBe("false");
  });

  it("toggling a chip flips its pressed state and disables submit until one is selected", async () => {
    await render();
    const nameInput = container.querySelector('input[placeholder="Name"]') as HTMLInputElement;
    const capInput = container.querySelector('input[placeholder="Cap"]') as HTMLInputElement;
    const submitButton = container.querySelector('button[type="submit"]') as HTMLButtonElement;

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(nameInput, "Groceries");
      nameInput.dispatchEvent(new Event("input", { bubbles: true }));
      setter?.call(capInput, "500.00");
      capInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(submitButton.disabled).toBe(true);

    await act(async () => {
      chipFor("Groceries List").click();
    });
    expect(submitButton.disabled).toBe(false);
    expect(chipFor("Groceries List").getAttribute("aria-pressed")).toBe("true");

    await act(async () => {
      chipFor("Groceries List").click();
    });
    expect(submitButton.disabled).toBe(true);
    expect(chipFor("Groceries List").getAttribute("aria-pressed")).toBe("false");
  });

  it("submits the checked source list ids and clears the form on success", async () => {
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
    };
    createBudgetMock.mockResolvedValue({ ok: true, budget: created });
    const onCreated = vi.fn();
    await render(onCreated);

    const nameInput = container.querySelector('input[placeholder="Name"]') as HTMLInputElement;
    const capInput = container.querySelector('input[placeholder="Cap"]') as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(nameInput, "Groceries");
      nameInput.dispatchEvent(new Event("input", { bubbles: true }));
      setter?.call(capInput, "500.00");
      capInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      chipFor("Groceries List").click();
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
  });

  it("omits period fields as null when both date inputs are left empty", async () => {
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
        period_start: null,
        period_end: null,
        created_at: "2026-08-01T00:00:00Z",
      },
    });
    await render();

    const nameInput = container.querySelector('input[placeholder="Name"]') as HTMLInputElement;
    const capInput = container.querySelector('input[placeholder="Cap"]') as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(nameInput, "Groceries");
      nameInput.dispatchEvent(new Event("input", { bubbles: true }));
      setter?.call(capInput, "500.00");
      capInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      chipFor("Groceries List").click();
    });

    const form = container.querySelector("form") as HTMLFormElement;
    await act(async () => {
      form.requestSubmit();
    });

    expect(createBudgetMock).toHaveBeenCalledWith(
      expect.objectContaining({ period_start: null, period_end: null }),
      messages,
    );
  });

  it("submits both period fields when both date inputs are set", async () => {
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
    const periodStartInput = container.querySelector(
      'input[aria-label="From (optional)"]',
    ) as HTMLInputElement;
    const periodEndInput = container.querySelector(
      'input[aria-label="To (optional)"]',
    ) as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(nameInput, "Groceries");
      nameInput.dispatchEvent(new Event("input", { bubbles: true }));
      setter?.call(capInput, "500.00");
      capInput.dispatchEvent(new Event("input", { bubbles: true }));
      setter?.call(periodStartInput, "2026-01-01");
      periodStartInput.dispatchEvent(new Event("input", { bubbles: true }));
      setter?.call(periodEndInput, "2026-01-31");
      periodEndInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      chipFor("Groceries List").click();
    });

    const form = container.querySelector("form") as HTMLFormElement;
    await act(async () => {
      form.requestSubmit();
    });

    expect(createBudgetMock).toHaveBeenCalledWith(
      expect.objectContaining({ period_start: "2026-01-01", period_end: "2026-01-31" }),
      messages,
    );
  });

  it("shows the source-lists error message when the submission is rejected", async () => {
    createBudgetMock.mockResolvedValue({ ok: false, error: messages.errorInvalidBudgetSourceLists });
    await render();

    const nameInput = container.querySelector('input[placeholder="Name"]') as HTMLInputElement;
    const capInput = container.querySelector('input[placeholder="Cap"]') as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(nameInput, "Groceries");
      nameInput.dispatchEvent(new Event("input", { bubbles: true }));
      setter?.call(capInput, "500.00");
      capInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      chipFor("Groceries List").click();
    });

    const form = container.querySelector("form") as HTMLFormElement;
    await act(async () => {
      form.requestSubmit();
    });

    expect(container.textContent).toContain(messages.errorInvalidBudgetSourceLists);
  });
});
