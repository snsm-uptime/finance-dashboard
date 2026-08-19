/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SlideDown } from "./SlideDown";

describe("SlideDown", () => {
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

  it("hides the panel from assistive tech and focus when closed", async () => {
    await act(async () => {
      root.render(
        <SlideDown open={false} id="panel" labelledBy="trigger">
          <button type="button">Inside</button>
        </SlideDown>,
      );
    });

    const region = container.querySelector('[role="region"]') as HTMLElement;
    expect(region.getAttribute("id")).toBe("panel");
    expect(region.getAttribute("aria-labelledby")).toBe("trigger");
    expect(region.getAttribute("aria-hidden")).toBe("true");
    expect(region.querySelector("div")?.hasAttribute("inert")).toBe(true);
  });

  it("exposes the panel when open", async () => {
    await act(async () => {
      root.render(
        <SlideDown open id="panel" labelledBy="trigger">
          <p>Routing form</p>
        </SlideDown>,
      );
    });

    const region = container.querySelector('[role="region"]') as HTMLElement;
    expect(region.getAttribute("aria-hidden")).toBe("false");
    expect(region.querySelector("div")?.hasAttribute("inert")).toBe(false);
    expect(region.textContent).toContain("Routing form");
  });
});
