/** @vitest-environment jsdom */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { IconButton } from "./IconButton";

describe("IconButton", () => {
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

  it("defaults to a compact ghost button: type=button, no fill/border classes", async () => {
    await act(async () => {
      root.render(<IconButton icon={<span />} label="Close" />);
    });
    const button = container.querySelector("button") as HTMLButtonElement;

    expect(button.getAttribute("type")).toBe("button");
    expect(button.getAttribute("aria-label")).toBe("Close");

    const classList = button.className.split(/\s+/);
    // Compact ghost chrome present.
    expect(classList).toContain("inline-flex");
    expect(classList).toContain("flex-shrink-0");
    expect(classList).toContain("border-0");
    expect(classList).toContain("bg-transparent");
    // Does not stretch by default.
    expect(classList).not.toContain("w-full");
    expect(classList).not.toContain("min-w-0");
  });

  it("stretches to fill a width-constrained parent when fill is set", async () => {
    await act(async () => {
      root.render(
        <div style={{ width: "300px" }}>
          <IconButton icon={<span />} label="Save" fill />
        </div>,
      );
    });
    const button = container.querySelector("button") as HTMLButtonElement;
    const classList = button.className.split(/\s+/);

    // jsdom has no real layout engine, so we assert on the utility classes
    // that produce full-width stretching rather than a measured pixel width.
    expect(classList).toContain("!w-full");
    expect(classList).toContain("min-w-0");
    // flex-shrink-0 is kept (not neutralized) so the button never shrinks
    // below its full-width basis in a future multi-child flex row.
    expect(classList).toContain("flex-shrink-0");
    expect(classList).not.toContain("!flex-shrink");
    // Still a real button, still labeled/typed the same as compact mode.
    expect(button.getAttribute("type")).toBe("button");
    expect(button.getAttribute("aria-label")).toBe("Save");
  });

  it("keeps default (non-fill) callers unaffected by the fill code path", async () => {
    await act(async () => {
      root.render(<IconButton icon={<span />} label="Share" variant="muted" />);
    });
    const button = container.querySelector("button") as HTMLButtonElement;
    const classList = button.className.split(/\s+/);

    expect(classList).not.toContain("!w-full");
    expect(classList).not.toContain("!flex-shrink");
    expect(classList).toContain("flex-shrink-0");
  });

  it("applies the ghost variant class for icon-only chrome", async () => {
    await act(async () => {
      root.render(<IconButton icon={<span />} label="Add expense" variant="ghost" />);
    });
    const button = container.querySelector("button") as HTMLButtonElement;
    const classList = button.className.split(/\s+/);

    expect(classList).toContain("border-0");
    expect(classList).toContain("bg-transparent");
    expect(button.getAttribute("aria-label")).toBe("Add expense");
  });

  it("allows type to be overridden via rest props (e.g. type=submit)", async () => {
    await act(async () => {
      root.render(<IconButton icon={<span />} label="Save" type="submit" />);
    });
    const button = container.querySelector("button") as HTMLButtonElement;
    expect(button.getAttribute("type")).toBe("submit");
  });

  it("still respects disabled and onClick regardless of fill", async () => {
    let clicked = false;
    await act(async () => {
      root.render(
        <IconButton
          icon={<span />}
          label="Save"
          fill
          disabled
          onClick={() => {
            clicked = true;
          }}
        />,
      );
    });
    const button = container.querySelector("button") as HTMLButtonElement;
    expect(button.disabled).toBe(true);

    await act(async () => {
      button.click();
    });
    expect(clicked).toBe(false);
  });
});

describe("IconButton.module.scss ghost variant", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const css = readFileSync(join(here, "IconButton.module.scss"), "utf8");

  it("keeps hover and rest chrome off the plate — color only on the glyph", () => {
    expect(css).toContain(".ghost:not(:disabled):hover,");
    expect(css).toContain("background: transparent !important;");
    expect(css).toContain(
      "color: color-mix(in srgb, var(--muted) 90%, var(--foreground)) !important;",
    );
    expect(css).not.toMatch(
      /\.ghost:not\(:disabled\):hover \{[^}]*background: color-mix/,
    );
    expect(css).toContain('.ghost[aria-current="page"]');
  });
});
