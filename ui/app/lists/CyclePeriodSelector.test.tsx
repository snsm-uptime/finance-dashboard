/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { listsMessages } from "@/lib/i18n/lists";
import { CyclePeriodSelector, type CyclePeriodOption } from "./CyclePeriodSelector";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const messages = {
  cyclePeriodSelectorLabel: listsMessages.en.cyclePeriodSelectorLabel,
  cyclePeriodOptionUnknownCard: listsMessages.en.cyclePeriodOptionUnknownCard,
};

const twoCycles: CyclePeriodOption[] = [
  {
    statementId: "stmt-newer",
    cardLabel: "BAC Visa",
    periodStart: "2026-07-10",
    periodEnd: "2026-08-09",
  },
  {
    statementId: "stmt-older",
    cardLabel: null,
    periodStart: "2026-06-10",
    periodEnd: "2026-07-09",
  },
];

describe("CyclePeriodSelector", () => {
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

  it("renders nothing for 0 cycles (AC #3)", () => {
    act(() => {
      root.render(
        <CyclePeriodSelector
          listId="list-1"
          cycles={[]}
          selectedStatementId={null}
          messages={messages}
        />,
      );
    });
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing for 1 cycle (AC #3)", () => {
    act(() => {
      root.render(
        <CyclePeriodSelector
          listId="list-1"
          cycles={[twoCycles[0]]}
          selectedStatementId="stmt-newer"
          messages={messages}
        />,
      );
    });
    expect(container.innerHTML).toBe("");
  });

  it("renders the select with a labeled option per cycle for 2+ cycles", () => {
    act(() => {
      root.render(
        <CyclePeriodSelector
          listId="list-1"
          cycles={twoCycles}
          selectedStatementId="stmt-newer"
          messages={messages}
        />,
      );
    });
    const button = container.querySelector("button") as HTMLButtonElement;
    expect(button).not.toBeNull();
    expect(button.getAttribute("aria-label")).toBe(messages.cyclePeriodSelectorLabel);
    expect(button.textContent).toContain("BAC Visa");
    act(() => {
      button.click();
    });
    const options = Array.from(container.querySelectorAll('[role="option"]'));
    expect(options).toHaveLength(2);
    // Missing card label falls back to the generic "Card" copy key.
    expect(options[1].textContent).toContain(messages.cyclePeriodOptionUnknownCard);
  });

  it("EN/ES both define and render the cycle-selector copy keys", () => {
    for (const locale of ["en", "es"] as const) {
      const localized = {
        cyclePeriodSelectorLabel: listsMessages[locale].cyclePeriodSelectorLabel,
        cyclePeriodOptionUnknownCard: listsMessages[locale].cyclePeriodOptionUnknownCard,
      };
      expect(localized.cyclePeriodSelectorLabel).toBeTruthy();
      expect(localized.cyclePeriodOptionUnknownCard).toBeTruthy();

      const localeContainer = document.createElement("div");
      document.body.appendChild(localeContainer);
      const localeRoot = createRoot(localeContainer);
      act(() => {
        localeRoot.render(
          <CyclePeriodSelector
            listId="list-1"
            cycles={twoCycles}
            selectedStatementId="stmt-newer"
            messages={localized}
          />,
        );
      });
      const button = localeContainer.querySelector("button") as HTMLButtonElement;
      expect(button.getAttribute("aria-label")).toBe(localized.cyclePeriodSelectorLabel);
      act(() => {
        button.click();
      });
      const options = Array.from(localeContainer.querySelectorAll('[role="option"]'));
      expect(options[1].textContent).toContain(localized.cyclePeriodOptionUnknownCard);
      act(() => {
        localeRoot.unmount();
      });
      localeContainer.remove();
    }
  });

  it("onChange navigates to ?period=<statementId>", () => {
    act(() => {
      root.render(
        <CyclePeriodSelector
          listId="list-1"
          cycles={twoCycles}
          selectedStatementId="stmt-newer"
          messages={messages}
        />,
      );
    });
    const button = container.querySelector("button") as HTMLButtonElement;
    act(() => {
      button.click();
    });
    const option = Array.from(container.querySelectorAll('[role="option"]'))[1] as HTMLElement;
    act(() => {
      option.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    expect(push).toHaveBeenCalledWith("/lists/list-1?period=stmt-older");
  });
});
