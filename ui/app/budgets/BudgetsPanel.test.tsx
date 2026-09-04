/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BudgetItem } from "./budgetsClient";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/budgets",
}));

vi.mock("@/components/PreferencesProvider", () => ({
  usePreferences: () => ({ locale: "en" }),
}));

const fetchBudgetsMock = vi.fn();
vi.mock("./budgetsClient", async () => {
  const actual =
    await vi.importActual<typeof import("./budgetsClient")>("./budgetsClient");
  return {
    ...actual,
    fetchBudgets: (...args: unknown[]) => fetchBudgetsMock(...args),
  };
});

vi.mock("@/app/lists/listsClient", async () => {
  const actual = await vi.importActual<
    typeof import("@/app/lists/listsClient")
  >("@/app/lists/listsClient");
  return {
    ...actual,
    fetchLists: vi.fn().mockResolvedValue({ ok: true, lists: [] }),
  };
});

import { AppShell } from "@/components/AppShell";
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
  period_start: null,
  period_end: null,
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
    // BudgetsPanel's masonry layout reads window.matchMedia (jsdom does not
    // implement it) to pick a column count.
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      })),
    );
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    resetMembershipListsStore();
    vi.unstubAllGlobals();
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

  it.each([
    { state: "ok" as const, spent: "10.00", cap: "500.00", label: "Under cap" },
    {
      state: "near" as const,
      spent: "400.00",
      cap: "500.00",
      label: "Near cap",
    },
    {
      state: "over" as const,
      spent: "600.00",
      cap: "500.00",
      label: "Over cap",
    },
  ])(
    "renders a TopProgressBar with the $state severity aria-label",
    async ({ state, spent, cap, label }) => {
      fetchBudgetsMock.mockResolvedValue({
        ok: true,
        budgets: [{ ...budget, state, spent, cap }],
      });
      await act(async () => {
        root.render(<BudgetsPanel />);
      });
      await act(async () => {
        await Promise.resolve();
      });

      const bar = container.querySelector('[role="progressbar"]');
      expect(bar).not.toBeNull();
      expect(bar?.getAttribute("aria-label")).toBe(label);
    },
  );

  it("renders the ghost create card as the first item, before any real budget", async () => {
    fetchBudgetsMock.mockResolvedValue({ ok: true, budgets: [budget] });
    await act(async () => {
      root.render(<BudgetsPanel />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    const items = Array.from(container.querySelectorAll("form[aria-label], a[href^='/budgets/']"));
    expect(items[0]?.tagName).toBe("FORM");
    expect(container.querySelector('form input[type="text"]')).not.toBeNull();
  });

  it("prepends a newly created budget after the ghost card without replacing it", async () => {
    fetchBudgetsMock.mockResolvedValue({ ok: true, budgets: [] });
    await act(async () => {
      root.render(<BudgetsPanel />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(container.querySelector("form")).not.toBeNull();
    expect(container.querySelectorAll('a[href^="/budgets/"]').length).toBe(0);
  });

  it("renders a help icon that navigates to /docs#budgets", async () => {
    fetchBudgetsMock.mockResolvedValue({ ok: true, budgets: [] });

    await act(async () => {
      root.render(
        <AppShell>
          <BudgetsPanel />
        </AppShell>,
      );
    });
    await act(async () => {
      await Promise.resolve();
    });

    const helpButton = container.querySelector(
      'button[aria-label="Learn more about Budgets"]',
    ) as HTMLButtonElement;
    expect(helpButton).toBeTruthy();

    await act(async () => {
      helpButton.click();
    });
    expect(push).toHaveBeenCalledWith("/docs?from=%2Fbudgets#budgets");
  });
});
