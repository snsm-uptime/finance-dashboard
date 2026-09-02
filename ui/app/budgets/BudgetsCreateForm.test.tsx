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
      chipFor("Groceries List").click();
    });

    const form = container.querySelector("form") as HTMLFormElement;
    await act(async () => {
      form.requestSubmit();
    });

    expect(container.textContent).toContain(messages.errorInvalidBudgetSourceLists);
  });
});
