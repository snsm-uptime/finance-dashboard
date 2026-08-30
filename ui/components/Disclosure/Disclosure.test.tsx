/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Disclosure } from "./Disclosure";

describe("Disclosure", () => {
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

  it("defaults closed, hides the body, and points its triangle left", () => {
    act(() => {
      root.render(<Disclosure title="Group transfer plan">Body content</Disclosure>);
    });
    const button = container.querySelector("button") as HTMLButtonElement;
    const region = container.querySelector('[role="region"]') as HTMLElement;
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(region.getAttribute("aria-hidden")).toBe("true");
    expect(button.querySelector("svg")?.getAttribute("class")).toContain("rotate-180");
  });

  it("opens the body and rotates the triangle down on click", () => {
    act(() => {
      root.render(<Disclosure title="Member details">Body content</Disclosure>);
    });
    const button = container.querySelector("button") as HTMLButtonElement;
    act(() => {
      button.click();
    });
    const region = container.querySelector('[role="region"]') as HTMLElement;
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(region.getAttribute("aria-hidden")).toBe("false");
    expect(region.textContent).toContain("Body content");
    expect(button.querySelector("svg")?.getAttribute("class")).toContain("rotate-90");
  });

  it("honors defaultOpen and renders headerExtra outside the toggle button", () => {
    act(() => {
      root.render(
        <Disclosure title="Member details" defaultOpen headerExtra={<button type="button">Copy</button>}>
          Body content
        </Disclosure>,
      );
    });
    const buttons = Array.from(container.querySelectorAll("button"));
    const toggleButton = buttons.find((b) => b.textContent?.includes("Member details")) as HTMLButtonElement;
    const extraButton = buttons.find((b) => b.textContent === "Copy") as HTMLButtonElement;
    expect(toggleButton.getAttribute("aria-expanded")).toBe("true");
    expect(extraButton).toBeDefined();
    expect(toggleButton.contains(extraButton)).toBe(false);
  });
});
