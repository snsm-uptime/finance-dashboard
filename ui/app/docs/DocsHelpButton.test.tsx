/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
let pathname = "/cards";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => pathname,
}));

import { DocsHelpButton } from "./DocsHelpButton";

describe("DocsHelpButton", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    push.mockReset();
    pathname = "/cards";
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

  it("renders an icon-only button with an accessible name of 'Learn more about {page}'", async () => {
    await act(async () => {
      root.render(<DocsHelpButton pageName="Budgets" docsAnchor="/docs#budgets" />);
    });

    const button = container.querySelector("button") as HTMLButtonElement;
    expect(button.getAttribute("aria-label")).toBe("Learn more about Budgets");
    expect(button.textContent?.trim()).toBe("");
  });

  it("navigates to the given docsAnchor, carrying the current page as ?from= so /docs's Back can return here", async () => {
    pathname = "/cards";
    await act(async () => {
      root.render(<DocsHelpButton pageName="Cards" docsAnchor="/docs#cards-imports" />);
    });

    const button = container.querySelector("button") as HTMLButtonElement;
    await act(async () => {
      button.click();
    });

    expect(push).toHaveBeenCalledWith("/docs?from=%2Fcards#cards-imports");
  });

  it("URL-encodes a nested current page in ?from=", async () => {
    pathname = "/budgets/b1";
    await act(async () => {
      root.render(<DocsHelpButton pageName="Budgets" docsAnchor="/docs#budgets" />);
    });

    const button = container.querySelector("button") as HTMLButtonElement;
    await act(async () => {
      button.click();
    });

    expect(push).toHaveBeenCalledWith("/docs?from=%2Fbudgets%2Fb1#budgets");
  });
});
