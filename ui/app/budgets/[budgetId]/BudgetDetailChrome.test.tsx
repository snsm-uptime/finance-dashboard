/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/budgets/b1",
}));

vi.mock("@/components/PreferencesProvider", () => ({
  usePreferences: () => ({ locale: "en" }),
}));

import { AppShell } from "@/components/AppShell";
import { BudgetDetailChrome } from "./BudgetDetailChrome";

describe("BudgetDetailChrome", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    push.mockReset();
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

  it("renders a help icon that navigates to /docs#budgets", async () => {
    await act(async () => {
      root.render(
        <AppShell>
          <BudgetDetailChrome
            title="Groceries"
            budgetId="b1"
            isArchived={false}
            archiveLabel="Archive"
            unarchiveLabel="Unarchive"
            messages={{
              errorGeneric: "Something went wrong.",
              errorUnauthorized: "Please sign in again.",
              errorInvalidBudgetName: "Enter a budget name.",
              errorInvalidBudgetCap: "Enter a valid budget cap.",
              errorInvalidBudgetCurrency: "Choose a supported currency.",
              errorInvalidBudgetSourceLists: "Select at least one source list.",
              errorInvalidBudgetPeriod: "Period start must be on or before period end.",
              errorForbidden: "You do not have access to this.",
            }}
          />
        </AppShell>,
      );
    });

    const helpButton = container.querySelector(
      'button[aria-label="Learn more about Budgets"]',
    ) as HTMLButtonElement;
    expect(helpButton).toBeTruthy();

    await act(async () => {
      helpButton.click();
    });
    expect(push).toHaveBeenCalledWith("/docs?from=%2Fbudgets%2Fb1#budgets");
  });
});
