/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Tooltip } from "./Tooltip";

describe("Tooltip", () => {
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

  it("renders a bubble with the label alongside its trigger (CSS drives hover/focus visibility)", async () => {
    await act(async () => {
      root.render(
        <Tooltip label="Copy IBAN">
          <button type="button">trigger</button>
        </Tooltip>,
      );
    });

    const bubble = container.querySelector('[data-testid="tooltip-bubble"]');
    expect(bubble).not.toBeNull();
    expect(bubble?.textContent).toBe("Copy IBAN");
    // Trigger renders untouched inside the wrapper.
    expect(container.querySelector("button")?.textContent).toBe("trigger");
  });

  it("suppresses the bubble when disabled", async () => {
    await act(async () => {
      root.render(
        <Tooltip label="Copy IBAN" disabled>
          <button type="button">trigger</button>
        </Tooltip>,
      );
    });

    expect(container.querySelector('[data-testid="tooltip-bubble"]')).toBeNull();
  });

  it("suppresses the bubble when label is an empty string", async () => {
    await act(async () => {
      root.render(
        <Tooltip label="">
          <button type="button">trigger</button>
        </Tooltip>,
      );
    });

    expect(container.querySelector('[data-testid="tooltip-bubble"]')).toBeNull();
  });

  it("forwards wrapperClassName onto the wrapper span so layout classes survive the extra wrapper", async () => {
    await act(async () => {
      root.render(
        <Tooltip label="Save" wrapperClassName="flex-shrink-0 !w-full min-w-0">
          <button type="button">trigger</button>
        </Tooltip>,
      );
    });

    const wrapper = container.firstElementChild as HTMLElement;
    const classList = wrapper.className.split(/\s+/);
    expect(classList).toContain("flex-shrink-0");
    expect(classList).toContain("!w-full");
    expect(classList).toContain("min-w-0");
  });
});
