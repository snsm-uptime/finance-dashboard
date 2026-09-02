/** @vitest-environment jsdom */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./ButtonGroup.module.scss", () => ({
  default: new Proxy(
    {},
    {
      get: (_t, prop) => String(prop),
    },
  ),
}));

vi.mock("@/components/IconButton/IconButton.module.scss", () => ({
  default: new Proxy(
    {},
    {
      get: (_t, prop) => String(prop),
    },
  ),
}));

vi.mock("@/components/FormIconSubmit/FormIconSubmit.module.scss", () => ({
  default: new Proxy(
    {},
    {
      get: (_t, prop) => String(prop),
    },
  ),
}));

import { FormIconSubmit } from "@/components/FormIconSubmit";
import { IconButton } from "@/components/IconButton";

import { ButtonGroup } from "./ButtonGroup";

const here = dirname(fileURLToPath(import.meta.url));

describe("ButtonGroup", () => {
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

  it("renders a labelled group and skips falsy buttons", async () => {
    await act(async () => {
      root.render(
        <ButtonGroup
          orientation="vertical"
          aria-label="List actions"
          buttons={[
            <IconButton key="add" icon={<span />} label="Add" />,
            false,
            null,
            undefined,
            <IconButton key="share" icon={<span />} label="Share" />,
          ]}
        />,
      );
    });

    const group = container.querySelector('[role="group"]') as HTMLElement;
    expect(group).not.toBeNull();
    expect(group.getAttribute("aria-label")).toBe("List actions");
    expect(group.className.split(/\s+/)).toEqual(
      expect.arrayContaining(["group", "vertical"]),
    );

    const buttons = container.querySelectorAll("button");
    expect(buttons).toHaveLength(2);
    expect(buttons[0]?.getAttribute("aria-label")).toBe("Add");
    expect(buttons[1]?.getAttribute("aria-label")).toBe("Share");
    expect(buttons[0]?.className.split(/\s+/)).toContain("item");
    expect(buttons[1]?.className.split(/\s+/)).toContain("item");
  });

  it("defaults to a horizontal cluster", async () => {
    await act(async () => {
      root.render(
        <ButtonGroup
          buttons={[<IconButton key="only" icon={<span />} label="Only" />]}
        />,
      );
    });

    const group = container.querySelector('[role="group"]') as HTMLElement;
    const classList = group.className.split(/\s+/);
    expect(classList).toContain("horizontal");
    expect(classList).not.toContain("vertical");
  });

  it("accepts FormIconSubmit, which composes IconButton", async () => {
    await act(async () => {
      root.render(
        <ButtonGroup
          buttons={[
            <FormIconSubmit key="save" label="Save" />,
            <IconButton key="share" icon={<span />} label="Share" />,
          ]}
        />,
      );
    });

    const buttons = container.querySelectorAll("button");
    expect(buttons).toHaveLength(2);
    expect(buttons[0]?.getAttribute("aria-label")).toBe("Save");
    expect(buttons[0]?.className.split(/\s+/)).toContain("item");
    expect(buttons[1]?.className.split(/\s+/)).toContain("item");
  });

  it("lands the .item class on the IconButton's own root button, not a wrapper (Tooltip clones, doesn't wrap)", async () => {
    await act(async () => {
      root.render(
        <ButtonGroup
          aria-label="Group"
          buttons={[<IconButton key="add" icon={<span />} label="Add" />]}
        />,
      );
    });

    const group = container.querySelector('[role="group"]') as HTMLElement;
    const button = container.querySelector("button") as HTMLButtonElement;
    // No wrapper element between the group and the button: it's the
    // group's direct (and here, only) child, so :first-child/:last-child
    // and equal-width flex-item selectors in ButtonGroup.module.scss apply
    // to the actual button.
    expect(button.parentElement).toBe(group);
    expect(button.className.split(/\s+/)).toContain("item");
  });

  it("forwards caller className onto the group and each button", async () => {
    await act(async () => {
      root.render(
        <ButtonGroup
          className="anchor"
          buttons={[
            <IconButton
              key="add"
              className="extra"
              icon={<span />}
              label="Add"
            />,
          ]}
        />,
      );
    });

    const group = container.querySelector('[role="group"]') as HTMLElement;
    expect(group.className.split(/\s+/)).toContain("anchor");
    const button = container.querySelector("button") as HTMLButtonElement;
    expect(button.className.split(/\s+/)).toEqual(
      expect.arrayContaining(["item", "extra"]),
    );
  });
});

describe("ButtonGroup.module.scss", () => {
  const css = readFileSync(join(here, "ButtonGroup.module.scss"), "utf8");

  it("rounds only the outer corners; inner joints stay square", () => {
    expect(css).toContain(".item {\n  padding: 0.7rem 0 !important;\n  border-radius: 0 !important;");
    expect(css).toContain(
      "border-radius: var(--button-group-radius) var(--button-group-radius) 0 0 !important;",
    );
    expect(css).toContain(
      "border-radius: 0 0 var(--button-group-radius) var(--button-group-radius) !important;",
    );
    expect(css).toContain(
      "border-radius: var(--button-group-radius) 0 0 var(--button-group-radius) !important;",
    );
    expect(css).toContain(
      "border-radius: 0 var(--button-group-radius) var(--button-group-radius) 0 !important;",
    );
    expect(css).toContain(
      ".item:first-child:last-child {\n  border-radius: var(--button-group-radius) !important;",
    );
  });

  it("draws inner dividers on the trailing edge of every item except the last", () => {
    expect(css).toContain(".horizontal .item:not(:last-child)");
    expect(css).toContain("border-right: 1px solid var(--border);");
    expect(css).toContain(".vertical .item:not(:last-child)");
    expect(css).toContain("border-bottom: 1px solid var(--border);");
  });

  it("owns the compact icon-cluster format (size, shadow, item padding, accent hover)", () => {
    expect(css).toContain("width: 3.25rem;");
    expect(css).toContain(
      "box-shadow: 0 6px 18px color-mix(in srgb, var(--foreground) 12%, transparent);",
    );
    expect(css).toContain("padding: 0.7rem 0 !important;");
    expect(css).toContain("color: var(--accent) !important;");
    expect(css).toContain(
      "background: color-mix(in srgb, var(--border) 35%, transparent) !important;",
    );
  });
});
