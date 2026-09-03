/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/upload/session/s1",
}));

vi.mock("@/components/PreferencesProvider", () => ({
  usePreferences: () => ({ locale: "en" }),
}));

const fetchImportSession = vi.fn();
vi.mock("../../uploadClient", async () => {
  const actual = await vi.importActual<typeof import("../../uploadClient")>(
    "../../uploadClient",
  );
  return {
    ...actual,
    fetchImportSession: (...args: unknown[]) => fetchImportSession(...args),
  };
});

import { AppShell } from "@/components/AppShell";
import { SessionReviewRoute } from "./SessionReviewRoute";

describe("SessionReviewRoute", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    push.mockReset();
    fetchImportSession.mockReset();
    fetchImportSession.mockReturnValue(new Promise(() => {}));
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

  it("renders a help icon (even while the session is loading) that navigates to /docs#cards-imports", async () => {
    await act(async () => {
      root.render(
        <AppShell>
          <SessionReviewRoute sessionId="s1" />
        </AppShell>,
      );
    });

    const helpButton = container.querySelector(
      'button[aria-label="Learn more about Upload"]',
    ) as HTMLButtonElement;
    expect(helpButton).toBeTruthy();

    await act(async () => {
      helpButton.click();
    });
    expect(push).toHaveBeenCalledWith("/docs?from=%2Fupload%2Fsession%2Fs1#cards-imports");
  });
});
