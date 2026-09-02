/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BudgetsCreateForm, type BudgetsCreateFormMessages } from "./BudgetsCreateForm";
import type { BudgetItem } from "./budgetsClient";

const fetchListsMock = vi.fn();
vi.mock("@/app/lists/listsClient", () => ({
  fetchLists: (...args: unknown[]) => fetchListsMock(...args),
}));

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
  errorForbidden: "forbidden",
  budgetsCreateTitle: "New budget",
  budgetsNameLabel: "Name",
  budgetsCapLabel: "Cap",
  budgetsCurrencyLabel: "Currency",
  budgetsSourceListsLabel: "Source lists",
  budgetsCreateSubmit: "Create budget",
  budgetsCreating: "Creating…",
};

const lists = [
  { id: "l1", name: "Groceries List", owner_id: "u1", role: "owner" },
  { id: "l2", name: "Roommates List", owner_id: "u1", role: "owner" },
];

describe("BudgetsCreateForm", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    fetchListsMock.mockReset();
    fetchListsMock.mockResolvedValue({ ok: true, lists });
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
      root.render(<BudgetsCreateForm messages={messages} onCreated={onCreated} />);
    });
    // Flush the fetchLists() effect.
    await act(async () => {
      await Promise.resolve();
    });
  }

  function checkboxFor(listName: string): HTMLInputElement {
    const label = Array.from(container.querySelectorAll("label")).find((el) =>
      el.textContent?.includes(listName),
    );
    return label?.querySelector('input[type="checkbox"]') as HTMLInputElement;
  }

  it("renders one checkbox per source list from fetchLists", async () => {
    await render();
    expect(checkboxFor("Groceries List")).not.toBeNull();
    expect(checkboxFor("Roommates List")).not.toBeNull();
  });

  it("disables submit until at least one source list is checked", async () => {
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
      checkboxFor("Groceries List").click();
    });
    expect(submitButton.disabled).toBe(false);
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
      checkboxFor("Groceries List").click();
    });

    const form = container.querySelector("form") as HTMLFormElement;
    await act(async () => {
      form.requestSubmit();
    });

    expect(createBudgetMock).toHaveBeenCalledWith(
      { name: "Groceries", cap: "500.00", currency: "CRC", source_list_ids: ["l1"] },
      messages,
    );
    expect(onCreated).toHaveBeenCalledWith(created);
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
      checkboxFor("Groceries List").click();
    });

    const form = container.querySelector("form") as HTMLFormElement;
    await act(async () => {
      form.requestSubmit();
    });

    expect(container.textContent).toContain(messages.errorInvalidBudgetSourceLists);
  });
});
