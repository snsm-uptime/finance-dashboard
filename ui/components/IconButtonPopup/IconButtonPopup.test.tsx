/** @vitest-environment jsdom */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { IconButton } from "@/components/IconButton";

vi.mock("./IconButtonPopup.module.scss", () => ({
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

import { IconButtonPopup, IconButtonPopupItem } from "./IconButtonPopup";

const here = dirname(fileURLToPath(import.meta.url));

function dispatchPointerDown(target: EventTarget) {
  target.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
}

describe("IconButtonPopup", () => {
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

  it("opens on IconButton click and wires menu aria onto that button", async () => {
    await act(async () => {
      root.render(
        <IconButtonPopup button={<IconButton icon={<span />} label="Options" />}>
          <IconButtonPopupItem>Invite</IconButtonPopupItem>
        </IconButtonPopup>,
      );
    });

    const trigger = container.querySelector("button") as HTMLButtonElement;
    expect(trigger.getAttribute("aria-label")).toBe("Options");
    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector('[role="menu"]')).toBeNull();

    await act(async () => {
      trigger.click();
    });

    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(trigger.getAttribute("aria-controls")).toBeTruthy();
    expect(container.querySelector('[role="menu"]')?.textContent).toContain("Invite");
  });

  it("does not close when clicking non-item content inside the popup", async () => {
    await act(async () => {
      root.render(
        <IconButtonPopup button={<IconButton icon={<span />} label="Options" />}>
          <p>Keep me</p>
          <IconButtonPopupItem>Invite</IconButtonPopupItem>
        </IconButtonPopup>,
      );
    });

    const trigger = container.querySelector("button") as HTMLButtonElement;
    await act(async () => {
      trigger.click();
    });

    const note = Array.from(container.querySelectorAll("p")).find(
      (el) => el.textContent === "Keep me",
    ) as HTMLParagraphElement;
    await act(async () => {
      note.click();
    });

    expect(container.querySelector('[role="menu"]')).not.toBeNull();
    expect(container.textContent).toContain("Keep me");
  });

  it("closes on an item click without blocking that item's handler", async () => {
    const onInvite = vi.fn();
    await act(async () => {
      root.render(
        <IconButtonPopup button={<IconButton icon={<span />} label="Options" />}>
          <IconButtonPopupItem onClick={onInvite}>Invite</IconButtonPopupItem>
        </IconButtonPopup>,
      );
    });

    const trigger = container.querySelector("button") as HTMLButtonElement;
    await act(async () => {
      trigger.click();
    });

    const item = Array.from(container.querySelectorAll('[role="menuitem"]')).find(
      (el) => el.textContent === "Invite",
    ) as HTMLButtonElement;
    await act(async () => {
      item.click();
    });

    expect(onInvite).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[role="menu"]')).toBeNull();
  });

  it("closes on a pointerdown outside the popup", async () => {
    await act(async () => {
      root.render(
        <IconButtonPopup button={<IconButton icon={<span />} label="Options" />}>
          <IconButtonPopupItem>Invite</IconButtonPopupItem>
        </IconButtonPopup>,
      );
    });

    const trigger = container.querySelector("button") as HTMLButtonElement;
    await act(async () => {
      trigger.click();
    });
    expect(container.querySelector('[role="menu"]')).not.toBeNull();

    await act(async () => {
      dispatchPointerDown(document.body);
    });

    expect(container.querySelector('[role="menu"]')).toBeNull();
  });

  it("keeps the popup open when an item opts into stayOpen", async () => {
    const onDelete = vi.fn();
    await act(async () => {
      root.render(
        <IconButtonPopup button={<IconButton icon={<span />} label="Options" />}>
          <IconButtonPopupItem stayOpen onClick={onDelete}>
            Delete
          </IconButtonPopupItem>
        </IconButtonPopup>,
      );
    });

    const trigger = container.querySelector("button") as HTMLButtonElement;
    await act(async () => {
      trigger.click();
    });

    const item = Array.from(container.querySelectorAll('[role="menuitem"]')).find(
      (el) => el.textContent === "Delete",
    ) as HTMLButtonElement;
    await act(async () => {
      item.click();
    });

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[role="menu"]')).not.toBeNull();
  });

  it("toggles closed when the IconButton is clicked while open", async () => {
    await act(async () => {
      root.render(
        <IconButtonPopup button={<IconButton icon={<span />} label="Options" />}>
          <IconButtonPopupItem>Invite</IconButtonPopupItem>
        </IconButtonPopup>,
      );
    });

    const trigger = container.querySelector("button") as HTMLButtonElement;
    await act(async () => {
      trigger.click();
    });
    expect(container.querySelector('[role="menu"]')).not.toBeNull();

    await act(async () => {
      trigger.click();
    });
    expect(container.querySelector('[role="menu"]')).toBeNull();
  });
});

describe("IconButtonPopup.module.scss", () => {
  const css = readFileSync(join(here, "IconButtonPopup.module.scss"), "utf8");

  it("anchors the panel below the trigger with the lists menu chrome", () => {
    expect(css).toContain("top: calc(100% + 0.35rem);");
    expect(css).toContain("min-width: var(--icon-button-popup-min-width, 11rem);");
    expect(css).toContain(
      "box-shadow: 0 8px 20px color-mix(in srgb, var(--foreground) 12%, transparent);",
    );
    expect(css).toContain("animation: slideDown 0.15s ease-out;");
  });
});
