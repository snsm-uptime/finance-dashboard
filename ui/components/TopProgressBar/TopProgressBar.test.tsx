/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { TopProgressBar } from "./TopProgressBar";

function stubFocusVisible(element: HTMLElement, value: boolean) {
  const original = element.matches.bind(element);
  element.matches = ((selector: string) =>
    selector === ":focus-visible"
      ? value
      : original(selector)) as typeof element.matches;
}

describe("TopProgressBar", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
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

  it("renders a filled width proportional to ratio", async () => {
    await act(async () => {
      root.render(
        <TopProgressBar
          ratio={45}
          colorClassName="bg-owed"
          tooltipLabel="$45.00 / $100.00"
          ariaLabel="On track"
        />,
      );
    });
    const bar = container.querySelector('[role="progressbar"]') as HTMLElement;
    const fill = bar.firstElementChild as HTMLElement;
    expect(fill.style.width).toBe("45%");
    expect(fill.className).toContain("bg-owed");
    expect(bar.getAttribute("aria-valuenow")).toBe("45");
    expect(bar.getAttribute("aria-valuemin")).toBe("0");
    expect(bar.getAttribute("aria-valuemax")).toBe("100");
    expect(bar.getAttribute("aria-label")).toBe("On track");
  });

  it("clamps a ratio over 100 to a 100% fill width", async () => {
    await act(async () => {
      root.render(
        <TopProgressBar
          ratio={140}
          colorClassName="bg-owe"
          tooltipLabel="$140.00 / $100.00"
          ariaLabel="Over cap"
        />,
      );
    });
    const bar = container.querySelector('[role="progressbar"]') as HTMLElement;
    const fill = bar.firstElementChild as HTMLElement;
    expect(fill.style.width).toBe("100%");
    expect(bar.getAttribute("aria-valuenow")).toBe("100");
  });

  it("renders with no aria-valuenow and a muted fill when ratio is null", async () => {
    await act(async () => {
      root.render(
        <TopProgressBar
          ratio={null}
          colorClassName="bg-owed"
          tooltipLabel="$0.00 / $0.00"
          ariaLabel="No cap set"
        />,
      );
    });
    const bar = container.querySelector('[role="progressbar"]') as HTMLElement;
    const fill = bar.firstElementChild as HTMLElement;
    expect(bar.hasAttribute("aria-valuenow")).toBe(false);
    expect(bar.hasAttribute("aria-valuemin")).toBe(false);
    expect(bar.hasAttribute("aria-valuemax")).toBe(false);
    expect(fill.style.width).toBe("0%");
    expect(fill.className).toContain("bg-muted");
  });

  it("is keyboard-focusable", async () => {
    await act(async () => {
      root.render(
        <TopProgressBar
          ratio={45}
          colorClassName="bg-owed"
          tooltipLabel="$45.00 / $100.00"
          ariaLabel="On track"
        />,
      );
    });
    const bar = container.querySelector('[role="progressbar"]') as HTMLElement;
    expect(bar.tabIndex).toBe(0);
  });

  it("shows the tooltip text on hover", async () => {
    await act(async () => {
      root.render(
        <TopProgressBar
          ratio={45}
          colorClassName="bg-owed"
          tooltipLabel="$45.00 / $100.00"
          ariaLabel="On track"
        />,
      );
    });
    const bar = container.querySelector('[role="progressbar"]') as HTMLElement;

    await act(async () => {
      bar.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    const bubble = document.querySelector('[data-testid="tooltip-bubble"]');
    expect(bubble).not.toBeNull();
    expect(bubble?.textContent).toBe("$45.00 / $100.00");
  });

  it("shows the tooltip text on keyboard focus", async () => {
    await act(async () => {
      root.render(
        <TopProgressBar
          ratio={45}
          colorClassName="bg-owed"
          tooltipLabel="$45.00 / $100.00"
          ariaLabel="On track"
        />,
      );
    });
    const bar = container.querySelector('[role="progressbar"]') as HTMLElement;
    stubFocusVisible(bar, true);

    await act(async () => {
      bar.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    });
    const bubble = document.querySelector('[data-testid="tooltip-bubble"]');
    expect(bubble).not.toBeNull();
    expect(bubble?.textContent).toBe("$45.00 / $100.00");
  });
});
