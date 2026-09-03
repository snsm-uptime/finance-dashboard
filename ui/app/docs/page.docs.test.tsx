/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/docs",
}));

vi.mock("@/components/PreferencesProvider", () => ({
  usePreferences: () => ({ locale: "en" }),
}));

import { AppShell } from "@/components/AppShell";
import Docs from "./page";

const SECTION_IDS = ["lists", "cards-imports", "budgets"];

function setHash(hash: string) {
  window.history.replaceState(null, "", hash ? `/docs#${hash}` : "/docs");
}

function setLocation(url: string) {
  window.history.replaceState(null, "", url);
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("Docs page", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    push.mockReset();
    Element.prototype.scrollIntoView = vi.fn();
    setHash("");
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

  it("renders all three sections collapsed by default on a bare visit", async () => {
    await act(async () => {
      root.render(<Docs />);
    });
    await flush();

    const buttons = SECTION_IDS.map(
      (id) => document.getElementById(id)?.querySelector("button[aria-expanded]"),
    );
    for (const button of buttons) {
      expect(button).toBeTruthy();
      expect(button?.getAttribute("aria-expanded")).toBe("false");
    }
    // Collapsed panels are removed from the a11y tree, not just hidden via CSS.
    const panel = document.getElementById("lists")?.querySelector('[role="region"]');
    expect(panel?.getAttribute("aria-hidden")).toBe("true");
  });

  it("toggles a section open via its header button (mouse) and reports aria-expanded", async () => {
    await act(async () => {
      root.render(<Docs />);
    });
    await flush();

    const listsButton = document
      .getElementById("lists")
      ?.querySelector("button[aria-expanded]") as HTMLButtonElement;
    expect(listsButton).toBeTruthy();
    expect(listsButton.tagName).toBe("BUTTON"); // native button: Enter/Space toggle for free

    await act(async () => {
      listsButton.click();
    });
    expect(listsButton.getAttribute("aria-expanded")).toBe("true");

    await act(async () => {
      listsButton.click();
    });
    expect(listsButton.getAttribute("aria-expanded")).toBe("false");
  });

  it("auto-expands the containing section, scrolls, highlights, and focuses the target entry for an entry-level hash", async () => {
    setHash("lists-splitting-an-expense");

    await act(async () => {
      root.render(<Docs />);
    });
    await flush();

    const listsButton = document
      .getElementById("lists")
      ?.querySelector("button[aria-expanded]");
    expect(listsButton?.getAttribute("aria-expanded")).toBe("true");

    const heading = document.getElementById(
      "lists-splitting-an-expense",
    ) as HTMLHeadingElement;
    expect(heading).toBeTruthy();
    expect(heading.tagName).toBe("H3");
    expect(heading.getAttribute("tabindex")).toBe("-1");
    expect(document.activeElement).toBe(heading);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();

    const highlightWrapper = heading.parentElement as HTMLElement;
    expect(highlightWrapper.className).toContain("border-accent");
    expect(highlightWrapper.className).toContain("bg-accent/10");
  });

  it("auto-expands a section for a section-level hash without focusing/highlighting an entry", async () => {
    setHash("budgets");

    await act(async () => {
      root.render(<Docs />);
    });
    await flush();

    const budgetsButton = document
      .getElementById("budgets")
      ?.querySelector("button[aria-expanded]");
    expect(budgetsButton?.getAttribute("aria-expanded")).toBe("true");

    const listsButton = document
      .getElementById("lists")
      ?.querySelector("button[aria-expanded]");
    expect(listsButton?.getAttribute("aria-expanded")).toBe("false");

    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  it("removes the highlight on the next scroll or focus change elsewhere on the page", async () => {
    setHash("lists-splitting-an-expense");

    await act(async () => {
      root.render(<Docs />);
    });
    await flush();

    const heading = document.getElementById(
      "lists-splitting-an-expense",
    ) as HTMLHeadingElement;
    const highlightWrapper = heading.parentElement as HTMLElement;
    expect(highlightWrapper.className).toContain("border-accent");

    const otherButton = document.createElement("button");
    document.body.appendChild(otherButton);
    await act(async () => {
      otherButton.focus();
    });

    expect(highlightWrapper.className).not.toContain("border-accent");
    otherButton.remove();
  });

  it("gives every DocSection/DocEntry a unique id matching the kebab-case scheme", async () => {
    await act(async () => {
      root.render(<Docs />);
    });
    await flush();

    for (const sectionId of SECTION_IDS) {
      expect(document.getElementById(sectionId)).toBeTruthy();
    }

    const headings = Array.from(container.querySelectorAll("h3[id]"));
    const ids = headings.map((h) => h.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(SECTION_IDS.some((sectionId) => id.startsWith(`${sectionId}-`))).toBe(
        true,
      );
    }
    // Spot-check the exact anchor scheme from EXPERIENCE.md.
    expect(ids).toContain("lists-splitting-an-expense");
    expect(ids).toContain("budgets-creating-a-budget");
    expect(ids).toContain("cards-imports-registering-a-card");
  });

  it("chrome Back goes to the landing page on a bare /docs visit (e.g. the landing page's own link)", async () => {
    setLocation("/docs");

    await act(async () => {
      root.render(
        <AppShell>
          <Docs />
        </AppShell>,
      );
    });
    await flush();

    const back = container.querySelector('button[aria-label="Back"]') as HTMLButtonElement;
    expect(back).toBeTruthy();

    await act(async () => {
      back.click();
    });
    expect(push).toHaveBeenCalledWith("/");
  });

  it("chrome Back returns to the originating page when reached via a DocsHelpButton's ?from= link", async () => {
    setLocation("/docs?from=%2Fbudgets%2Fb1#budgets");

    await act(async () => {
      root.render(
        <AppShell>
          <Docs />
        </AppShell>,
      );
    });
    await flush();

    const back = container.querySelector('button[aria-label="Back"]') as HTMLButtonElement;
    expect(back).toBeTruthy();

    await act(async () => {
      back.click();
    });
    expect(push).toHaveBeenCalledWith("/budgets/b1");
  });

  it("ignores an unsafe/foreign ?from= value and falls back to the landing page", async () => {
    setLocation("/docs?from=%2F%2Fevil.example.com");

    await act(async () => {
      root.render(
        <AppShell>
          <Docs />
        </AppShell>,
      );
    });
    await flush();

    const back = container.querySelector('button[aria-label="Back"]') as HTMLButtonElement;
    await act(async () => {
      back.click();
    });
    expect(push).toHaveBeenCalledWith("/");
  });
});
