/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/home",
}));

vi.mock("@/components/PreferencesProvider", () => ({
  usePreferences: () => ({ locale: "en" }),
}));

import { AppShell } from "@/components/AppShell";
import { HomeChrome } from "./HomeChrome";

describe("HomeChrome", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    push.mockClear();
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

  it("renders the avatar in the standard leading slot (replacing Back), and the Lists help icon at the opposite end", () => {
    act(() => {
      root.render(
        <AppShell>
          <HomeChrome title="Lists" alias="sebas" userId="owner-1" photoBase64={null} />
        </AppShell>,
      );
    });

    const header = container.querySelector('[data-app-chrome="header"]') as HTMLElement;
    const leadingSlot = header.firstElementChild as HTMLElement;
    const avatar = leadingSlot.querySelector('[aria-label="sebas"]') as HTMLElement;
    expect(avatar).toBeTruthy();
    expect(leadingSlot.querySelector("button")).toBeNull(); // no Back button

    const titleEl = header.querySelector("h1") as HTMLElement;
    expect(titleEl.textContent).toBe("Lists");

    const helpButton = header.querySelector(
      'button[aria-label="Learn more about Lists"]',
    ) as HTMLButtonElement;
    expect(helpButton).toBeTruthy();
    // avatar (leading edge) comes before the help button (trailing, opposite edge)
    expect(
      avatar.compareDocumentPosition(helpButton) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    act(() => {
      helpButton.click();
    });
    expect(push).toHaveBeenCalledWith("/docs?from=%2Fhome#lists");
  });
});
