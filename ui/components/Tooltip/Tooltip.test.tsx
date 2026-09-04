/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SHOW_DELAY_MS, Tooltip } from "./Tooltip";

/**
 * jsdom's `:focus-visible` heuristic is limited/environment-dependent (in
 * this project's vitest+jsdom setup, `element.matches(':focus-visible')`
 * stays `false` even after a plain `.focus()` call that a real browser
 * would treat as keyboard-triggered — see the manual probe run during
 * development of this test file). Rather than depend on that heuristic,
 * stub `matches` to report the desired focus-visible state directly; this
 * is the most faithful available way to exercise Tooltip's own
 * `matches(':focus-visible')` branch without a real browser.
 */
function stubFocusVisible(element: HTMLElement, value: boolean) {
  const original = element.matches.bind(element);
  element.matches = ((selector: string) =>
    selector === ":focus-visible" ? value : original(selector)) as typeof element.matches;
}

describe("Tooltip", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.useRealTimers();
  });

  it("does not render a bubble until hovered or focused", async () => {
    await act(async () => {
      root.render(
        <Tooltip label="Copy IBAN">
          <button type="button">trigger</button>
        </Tooltip>,
      );
    });

    expect(document.querySelector('[data-testid="tooltip-bubble"]')).toBeNull();
  });

  it("shows the bubble on mouse hover and hides it on mouse leave", async () => {
    await act(async () => {
      root.render(
        <Tooltip label="Copy IBAN">
          <button type="button">trigger</button>
        </Tooltip>,
      );
    });
    const button = container.querySelector("button") as HTMLButtonElement;

    await act(async () => {
      button.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      vi.advanceTimersByTime(SHOW_DELAY_MS);
    });
    const bubble = document.querySelector('[data-testid="tooltip-bubble"]');
    expect(bubble).not.toBeNull();
    expect(bubble?.textContent).toBe("Copy IBAN");

    await act(async () => {
      button.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
    });
    expect(document.querySelector('[data-testid="tooltip-bubble"]')).toBeNull();
  });

  it("shows the bubble on focus and hides it on blur", async () => {
    await act(async () => {
      root.render(
        <Tooltip label="Copy IBAN">
          <button type="button">trigger</button>
        </Tooltip>,
      );
    });
    const button = container.querySelector("button") as HTMLButtonElement;
    stubFocusVisible(button, true);

    await act(async () => {
      button.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
      vi.advanceTimersByTime(SHOW_DELAY_MS);
    });
    expect(document.querySelector('[data-testid="tooltip-bubble"]')).not.toBeNull();

    await act(async () => {
      button.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    expect(document.querySelector('[data-testid="tooltip-bubble"]')).toBeNull();
  });

  it("does not show the bubble when focus is mouse-click-triggered, not keyboard", async () => {
    await act(async () => {
      root.render(
        <Tooltip label="Copy IBAN">
          <button type="button">trigger</button>
        </Tooltip>,
      );
    });
    const button = container.querySelector("button") as HTMLButtonElement;
    // A real browser doesn't match `:focus-visible` for a click-triggered
    // focus; stub `matches` to report exactly that state, since jsdom's own
    // `:focus-visible` heuristic isn't reliable in this environment (see
    // `stubFocusVisible` above).
    stubFocusVisible(button, false);

    await act(async () => {
      button.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      button.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    });
    expect(document.querySelector('[data-testid="tooltip-bubble"]')).toBeNull();
  });

  it("shows the bubble when focus is keyboard-triggered", async () => {
    await act(async () => {
      root.render(
        <Tooltip label="Copy IBAN">
          <button type="button">trigger</button>
        </Tooltip>,
      );
    });
    const button = container.querySelector("button") as HTMLButtonElement;
    stubFocusVisible(button, true);

    await act(async () => {
      button.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
      vi.advanceTimersByTime(SHOW_DELAY_MS);
    });
    expect(document.querySelector('[data-testid="tooltip-bubble"]')).not.toBeNull();
  });

  it("keeps the bubble visible when blurring while still hovered, and hides only once both leave", async () => {
    await act(async () => {
      root.render(
        <Tooltip label="Copy IBAN">
          <button type="button">trigger</button>
        </Tooltip>,
      );
    });
    const button = container.querySelector("button") as HTMLButtonElement;
    stubFocusVisible(button, true);

    await act(async () => {
      button.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    });
    await act(async () => {
      button.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      vi.advanceTimersByTime(SHOW_DELAY_MS);
    });
    expect(document.querySelector('[data-testid="tooltip-bubble"]')).not.toBeNull();

    // Blurring while still hovered must not hide the tooltip.
    await act(async () => {
      button.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    expect(document.querySelector('[data-testid="tooltip-bubble"]')).not.toBeNull();

    // Only leaving hover as well hides it.
    await act(async () => {
      button.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
    });
    expect(document.querySelector('[data-testid="tooltip-bubble"]')).toBeNull();
  });

  it("keeps the bubble visible when mouse-leaving while still focused, and hides only once both leave", async () => {
    await act(async () => {
      root.render(
        <Tooltip label="Copy IBAN">
          <button type="button">trigger</button>
        </Tooltip>,
      );
    });
    const button = container.querySelector("button") as HTMLButtonElement;
    stubFocusVisible(button, true);

    await act(async () => {
      button.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    await act(async () => {
      button.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
      vi.advanceTimersByTime(SHOW_DELAY_MS);
    });
    expect(document.querySelector('[data-testid="tooltip-bubble"]')).not.toBeNull();

    // Mouse-leaving while still keyboard-focused must not hide the tooltip.
    await act(async () => {
      button.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
    });
    expect(document.querySelector('[data-testid="tooltip-bubble"]')).not.toBeNull();

    // Only losing focus as well hides it.
    await act(async () => {
      button.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    expect(document.querySelector('[data-testid="tooltip-bubble"]')).toBeNull();
  });

  it("flips the bubble to render below the trigger when near the top of the viewport", async () => {
    await act(async () => {
      root.render(
        <Tooltip label="Copy IBAN">
          <button type="button">trigger</button>
        </Tooltip>,
      );
    });
    const button = container.querySelector("button") as HTMLButtonElement;
    button.getBoundingClientRect = () =>
      ({
        top: 10,
        bottom: 34,
        left: 100,
        right: 140,
        width: 40,
        height: 24,
        x: 100,
        y: 10,
        toJSON() {
          return this;
        },
      }) as DOMRect;

    await act(async () => {
      button.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      vi.advanceTimersByTime(SHOW_DELAY_MS);
    });

    const bubble = document.querySelector(
      '[data-testid="tooltip-bubble"]',
    ) as HTMLElement;
    expect(bubble).not.toBeNull();
    // Positioned below the trigger (bottom + gap), not above (top - gap).
    expect(bubble.style.top).toBe("38px");
    // Below placement doesn't use the `-100%` Y-translate.
    expect(bubble.style.transform).toBe("translate(-50%, 0)");
  });

  it("suppresses the bubble when disabled, even on hover", async () => {
    await act(async () => {
      root.render(
        <Tooltip label="Copy IBAN" disabled>
          <button type="button">trigger</button>
        </Tooltip>,
      );
    });
    const button = container.querySelector("button") as HTMLButtonElement;

    await act(async () => {
      button.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    expect(document.querySelector('[data-testid="tooltip-bubble"]')).toBeNull();
  });

  it("suppresses the bubble when label is an empty string", async () => {
    await act(async () => {
      root.render(
        <Tooltip label="">
          <button type="button">trigger</button>
        </Tooltip>,
      );
    });
    const button = container.querySelector("button") as HTMLButtonElement;

    await act(async () => {
      button.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    expect(document.querySelector('[data-testid="tooltip-bubble"]')).toBeNull();
  });

  it("does not insert a wrapper element around the trigger — it stays container's direct child", async () => {
    await act(async () => {
      root.render(
        <Tooltip label="Save">
          <button type="button">trigger</button>
        </Tooltip>,
      );
    });

    expect(container.children).toHaveLength(1);
    expect(container.firstElementChild?.tagName).toBe("BUTTON");
  });

  it("portals the bubble into document.body rather than nesting it under the trigger", async () => {
    await act(async () => {
      root.render(
        <Tooltip label="Save">
          <button type="button">trigger</button>
        </Tooltip>,
      );
    });
    const button = container.querySelector("button") as HTMLButtonElement;

    await act(async () => {
      button.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      vi.advanceTimersByTime(SHOW_DELAY_MS);
    });

    // Bubble exists in the document, but not inside the trigger's container.
    expect(document.querySelector('[data-testid="tooltip-bubble"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="tooltip-bubble"]')).toBeNull();
    // It's a direct child of <body>, not nested under the render container.
    expect(document.body.contains(document.querySelector('[data-testid="tooltip-bubble"]')!)).toBe(true);
  });

  it("preserves an existing onMouseEnter/onFocus handler on the trigger", async () => {
    let entered = false;
    let focused = false;
    await act(async () => {
      root.render(
        <Tooltip label="Save">
          <button
            type="button"
            onMouseEnter={() => {
              entered = true;
            }}
            onFocus={() => {
              focused = true;
            }}
          >
            trigger
          </button>
        </Tooltip>,
      );
    });
    const button = container.querySelector("button") as HTMLButtonElement;

    await act(async () => {
      button.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    expect(entered).toBe(true);

    await act(async () => {
      button.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    });
    expect(focused).toBe(true);
  });
});
