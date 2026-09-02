/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./TriSwitch.module.scss", () => ({
  default: new Proxy(
    {},
    {
      get: (_t, prop) => String(prop),
    },
  ),
}));

import { TriSwitch } from "./TriSwitch";

const options = [
  { value: "left", label: "Left", icon: <span data-icon="left" /> },
  { value: "mid", label: "Middle", icon: <span data-icon="mid" /> },
  { value: "right", label: "Right", icon: <span data-icon="right" /> },
] as const;

describe("TriSwitch", () => {
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

  it("exposes three radios, tooltips, and a sliding thumb on the selected value", async () => {
    await act(async () => {
      root.render(
        <TriSwitch
          aria-label="Placement"
          value="mid"
          options={options}
          onChange={() => undefined}
        />,
      );
    });

    const group = container.querySelector('[role="radiogroup"]') as HTMLElement;
    expect(group.getAttribute("aria-label")).toBe("Placement");
    expect(group.getAttribute("data-index")).toBe("1");

    const radios = container.querySelectorAll('[role="radio"]');
    expect(radios).toHaveLength(3);
    expect(radios[0]?.getAttribute("aria-label")).toBe("Left");
    expect(radios[0]?.hasAttribute("title")).toBe(false);
    expect(radios[1]?.getAttribute("aria-checked")).toBe("true");
    expect(radios[1]?.getAttribute("tabindex")).toBe("0");
    expect(radios[0]?.getAttribute("tabindex")).toBe("-1");

    const thumb = container.querySelector(".thumb") as HTMLElement;
    expect(thumb.getAttribute("data-index")).toBe("1");
  });

  it("moves to the clicked option", async () => {
    const onChange = vi.fn();
    await act(async () => {
      root.render(
        <TriSwitch value="mid" options={options} onChange={onChange} />,
      );
    });

    const left = container.querySelector('[aria-label="Left"]') as HTMLButtonElement;
    await act(async () => {
      left.click();
    });
    expect(onChange).toHaveBeenCalledWith("left");
  });

  it("steps with arrow keys from the selected radio", async () => {
    const onChange = vi.fn();
    await act(async () => {
      root.render(
        <TriSwitch value="mid" options={options} onChange={onChange} />,
      );
    });

    const group = container.querySelector('[role="radiogroup"]') as HTMLElement;
    await act(async () => {
      group.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
      );
    });
    expect(onChange).toHaveBeenCalledWith("right");
  });

  it("does not change when disabled", async () => {
    const onChange = vi.fn();
    await act(async () => {
      root.render(
        <TriSwitch
          value="mid"
          options={options}
          onChange={onChange}
          disabled
        />,
      );
    });

    const right = container.querySelector(
      '[aria-label="Right"]',
    ) as HTMLButtonElement;
    expect(right.disabled).toBe(true);
    await act(async () => {
      right.click();
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("keeps radio roles and roving tabIndex intact once each option is wrapped in Tooltip", async () => {
    await act(async () => {
      root.render(
        <TriSwitch value="right" options={options} onChange={() => undefined} />,
      );
    });

    const radios = container.querySelectorAll('[role="radio"]');
    expect(radios).toHaveLength(3);
    radios.forEach((radio) => {
      // Every option is still a real <button role="radio">, not swallowed by
      // the Tooltip wrapper it's now nested inside.
      expect(radio.tagName).toBe("BUTTON");
    });
    expect(radios[0]?.getAttribute("tabindex")).toBe("-1");
    expect(radios[1]?.getAttribute("tabindex")).toBe("-1");
    expect(radios[2]?.getAttribute("tabindex")).toBe("0");
    expect(radios[2]?.getAttribute("aria-checked")).toBe("true");
  });

  it("suppresses the option tooltip when the switch is disabled", async () => {
    await act(async () => {
      root.render(
        <TriSwitch
          value="mid"
          options={options}
          onChange={() => undefined}
          disabled
        />,
      );
    });

    // Tooltip renders no bubble node at all when suppressed.
    expect(container.querySelectorAll('[data-testid="tooltip-bubble"]')).toHaveLength(0);
  });
});
