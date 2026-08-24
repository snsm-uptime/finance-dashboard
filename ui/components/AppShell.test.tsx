/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useChromeBack, useChromeHeader } from "@/components/ChromeBack";
import { AppShell } from "./AppShell";

const push = vi.fn();
let pathname = "/upload";

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push }),
}));

vi.mock("@/components/PreferencesProvider", () => ({
  usePreferences: () => ({ locale: "en", theme: "light" }),
}));

vi.mock("@/components/IconButton/IconButton.module.scss", () => ({
  default: new Proxy(
    {},
    {
      get: (_t, prop) => String(prop),
    },
  ),
}));

function EnableBack({ href }: { href: string }) {
  useChromeBack(href);
  return <p>screen</p>;
}

function EnableHeader({
  href,
  title,
  details,
  onBack,
}: {
  href?: string;
  title?: string;
  details?: string;
  onBack?: () => void;
}) {
  useChromeHeader({ backHref: href, title, details, onBack });
  return <p>screen</p>;
}

describe("AppShell chrome header", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    push.mockReset();
    pathname = "/upload";
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

  it("hides the back control when no screen has opted in", async () => {
    await act(async () => {
      root.render(
        <AppShell>
          <p>home</p>
        </AppShell>,
      );
    });

    expect(container.querySelector('button[aria-label="Back"]')).toBeNull();
  });

  it("shows a chevron back control that pushes the opted-in href", async () => {
    await act(async () => {
      root.render(
        <AppShell>
          <EnableBack href="/upload" />
        </AppShell>,
      );
    });

    const back = container.querySelector('button[aria-label="Back"]') as HTMLButtonElement;
    expect(back).toBeTruthy();
    expect(back.querySelector("svg")).toBeTruthy();

    await act(async () => {
      back.click();
    });
    expect(push).toHaveBeenCalledWith("/upload");
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("does not show back on auth routes even if a child opts in", async () => {
    pathname = "/sign-in";
    await act(async () => {
      root.render(
        <AppShell>
          <EnableBack href="/upload" />
        </AppShell>,
      );
    });

    expect(container.querySelector('button[aria-label="Back"]')).toBeNull();
  });

  it("renders title and details on the same header row as back", async () => {
    await act(async () => {
      root.render(
        <AppShell>
          <EnableHeader href="/upload" title="Review statements" details="12 left" />
        </AppShell>,
      );
    });

    const header = container.querySelector("header");
    expect(header).toBeTruthy();
    const heading = header!.querySelector("h1");
    expect(heading?.textContent).toBe("Review statements");
    expect(header!.textContent).toContain("12 left");
    expect(header!.querySelector('button[aria-label="Back"]')).toBeTruthy();
  });

  it("runs onBack instead of pushing backHref when both are set", async () => {
    const onBack = vi.fn();
    await act(async () => {
      root.render(
        <AppShell>
          <EnableHeader href="/upload" title="Review statements" onBack={onBack} />
        </AppShell>,
      );
    });

    const back = container.querySelector('button[aria-label="Back"]') as HTMLButtonElement;
    await act(async () => {
      back.click();
    });
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
  });

  it("shows the header when a screen opts in with title only", async () => {
    await act(async () => {
      root.render(
        <AppShell>
          <EnableHeader title="Account" />
        </AppShell>,
      );
    });

    expect(container.querySelector("header h1")?.textContent).toBe("Account");
    expect(container.querySelector('button[aria-label="Back"]')).toBeNull();
  });
});
