/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MinimalInput } from "./MinimalInput";

describe("MinimalInput", () => {
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

  it("renders an underline-style text input with no border box", () => {
    act(() => {
      root.render(<MinimalInput placeholder="Budget name" value="" onChange={() => {}} />);
    });
    const input = container.querySelector("input") as HTMLInputElement;
    expect(input.placeholder).toBe("Budget name");
    expect(input.className).toContain("border-b-[1.5px]");
    expect(input.className).toContain("border-none");
  });

  it("merges a caller-provided className with the base classes", () => {
    act(() => {
      root.render(<MinimalInput className="text-right" value="" onChange={() => {}} />);
    });
    const input = container.querySelector("input") as HTMLInputElement;
    expect(input.className).toContain("text-right");
    expect(input.className).toContain("border-b-[1.5px]");
  });
});
