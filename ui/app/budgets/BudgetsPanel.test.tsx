/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BudgetItem } from "./budgetsClient";

vi.mock("@/components/PreferencesProvider", () => ({
  usePreferences: () => ({ locale: "en" }),
}));

const fetchBudgetsMock = vi.fn();
vi.mock("./budgetsClient", async () => {
  const actual = await vi.importActual<typeof import("./budgetsClient")>("./budgetsClient");
  return {
    ...actual,
    fetchBudgets: (...args: unknown[]) => fetchBudgetsMock(...args),
  };
});

vi.mock("@/app/lists/listsClient", async () => {
  const actual = await vi.importActual<typeof import("@/app/lists/listsClient")>(
    "@/app/lists/listsClient",
  );
  return { ...actual, fetchLists: vi.fn().mockResolvedValue({ ok: true, lists: [] }) };
});

import { BudgetsPanel } from "./BudgetsPanel";
import { resetMembershipListsStore } from "@/app/lists/membershipListsStore";

const budget: BudgetItem = {
  id: "b1",
  name: "Groceries",
  cap: "500.00",
  currency: "CRC",
  spent: "10.00",
  state: "ok",
  source_list_ids: [],
  created_at: "2026-08-01T00:00:00Z",
};

describe("BudgetsPanel tile link", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    fetchBudgetsMock.mockReset();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    resetMembershipListsStore();
  });

  it("renders each budget tile as a link to /budgets/{id}", async () => {
    fetchBudgetsMock.mockResolvedValue({ ok: true, budgets: [budget] });
    await act(async () => {
      root.render(<BudgetsPanel />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    const link = container.querySelector('a[href="/budgets/b1"]');
    expect(link).not.toBeNull();
    expect(link?.textContent).toContain("Groceries");
  });
});
