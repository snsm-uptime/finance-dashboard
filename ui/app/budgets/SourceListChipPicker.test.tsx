/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SourceListChipPicker, type SourceListChipPickerOption } from "./SourceListChipPicker";

const options: SourceListChipPickerOption[] = [
  { id: "l1", name: "Groceries List" },
  { id: "l2", name: "Roommates List" },
];

describe("SourceListChipPicker", () => {
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

  function render(selectedIds: string[], onToggle = vi.fn()) {
    act(() => {
      root.render(
        <SourceListChipPicker
          options={options}
          selectedIds={selectedIds}
          onToggle={onToggle}
          ariaLabel="Source lists"
          addLabel="+ Add list"
        />,
      );
    });
    return onToggle;
  }

  it("shows the add-list trigger and no removable chips when nothing is selected", () => {
    render([]);
    expect(container.textContent).toContain("+ Add list");
    expect(container.querySelector('button[aria-label*="(Source lists)"]')).toBeNull();
  });

  it("renders selected options as individual removable chips", () => {
    render(["l1"]);
    const chip = container.querySelector('button[aria-label*="(Source lists)"]') as HTMLButtonElement;
    expect(chip).not.toBeNull();
    expect(chip.textContent).toContain("Groceries List");
  });

  it("clicking a selected chip toggles it off directly, no panel", () => {
    const onToggle = render(["l1"]);
    const chip = container.querySelector('button[aria-label*="(Source lists)"]') as HTMLButtonElement;
    act(() => {
      chip.click();
    });
    expect(onToggle).toHaveBeenCalledWith("l1");
  });

  it("hides the add trigger once every option is selected", () => {
    render(["l1", "l2"]);
    expect(container.textContent).not.toContain("+ Add list");
  });

  it("opening the add trigger reveals only not-yet-selected options in the panel", () => {
    render(["l1"]);
    const trigger = Array.from(container.querySelectorAll("button")).find((el) =>
      el.textContent?.includes("+ Add list"),
    ) as HTMLButtonElement;
    act(() => {
      trigger.click();
    });
    expect(container.textContent).toContain("Roommates List");
    expect(
      Array.from(container.querySelectorAll("button")).some(
        (el) => el.textContent === "Roommates List",
      ),
    ).toBe(true);
  });

  it("selecting an option from the panel toggles it and closes the panel", () => {
    const onToggle = render([]);
    const trigger = Array.from(container.querySelectorAll("button")).find((el) =>
      el.textContent?.includes("+ Add list"),
    ) as HTMLButtonElement;
    act(() => {
      trigger.click();
    });
    const option = Array.from(container.querySelectorAll("button")).find(
      (el) => el.textContent === "Groceries List",
    ) as HTMLButtonElement;
    act(() => {
      option.click();
    });
    expect(onToggle).toHaveBeenCalledWith("l1");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });
});
