/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppShell } from "@/components/AppShell";
import { ConflictReviewPanel } from "./ConflictReviewPanel";
import type { SamePriceConflict } from "@/app/upload/conflictsClient";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/upload/conflicts",
  useRouter: () => ({ push }),
}));

vi.mock("@/components/PreferencesProvider", () => ({
  usePreferences: () => ({ locale: "en", theme: "light" }),
}));

const fetchConflictQueue = vi.fn();
const resolveConflict = vi.fn();
vi.mock("@/app/upload/conflictsClient", async () => {
  const actual =
    await vi.importActual<typeof import("@/app/upload/conflictsClient")>(
      "@/app/upload/conflictsClient",
    );
  return {
    ...actual,
    fetchConflictQueue: (...args: unknown[]) => fetchConflictQueue(...args),
    resolveConflict: (...args: unknown[]) => resolveConflict(...args),
  };
});

function makeConflict(id: string): SamePriceConflict {
  return {
    id,
    manual: {
      entry_id: `m-${id}`,
      list_id: "l1",
      list_name: "Groceries",
      amount: "10.00",
      currency: "CRC",
      normalized_description: "Manual entry",
      posted_date: "2026-08-10",
    },
    parsed: {
      entry_id: `p-${id}`,
      list_id: "l1",
      list_name: "Groceries",
      amount: "10.00",
      currency: "CRC",
      normalized_description: "Parsed entry",
      posted_date: "2026-08-10",
    },
    detected_at: "2026-08-10T00:00:00Z",
  };
}

describe("ConflictReviewPanel", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    push.mockReset();
    fetchConflictQueue.mockReset();
    resolveConflict.mockReset();
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

  it("renders both cards keyboard-selectable, with no swipe handler attached", async () => {
    fetchConflictQueue.mockResolvedValue({ ok: true, conflicts: [makeConflict("c1")] });

    await act(async () => {
      root.render(
        <AppShell>
          <ConflictReviewPanel landingListId="l1" />
        </AppShell>,
      );
    });
    await act(async () => {
      await Promise.resolve();
    });

    const buttons = Array.from(container.querySelectorAll("button"));
    const manualButton = buttons.find((b) => b.textContent === "Keep the manual entry");
    const parsedButton = buttons.find((b) => b.textContent === "Keep the imported entry");
    expect(manualButton).toBeTruthy();
    expect(parsedButton).toBeTruthy();
    // No touch/pointer drag handlers — this screen is button/keyboard only
    // (AC #5, UX-DR14/19), unlike Individual review's swipe gesture.
    expect(container.querySelector("[data-drag-target]")).toBeNull();
  });

  it("picking the manual entry resolves manual_survivor and advances to the next collision", async () => {
    fetchConflictQueue.mockResolvedValueOnce({
      ok: true,
      conflicts: [makeConflict("c1"), makeConflict("c2")],
    });
    resolveConflict.mockResolvedValue({ ok: true });
    fetchConflictQueue.mockResolvedValueOnce({ ok: true, conflicts: [makeConflict("c2")] });

    await act(async () => {
      root.render(
        <AppShell>
          <ConflictReviewPanel landingListId="l1" />
        </AppShell>,
      );
    });
    await act(async () => {
      await Promise.resolve();
    });

    const manualButton = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Keep the manual entry",
    ) as HTMLButtonElement;
    await act(async () => {
      manualButton.click();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(resolveConflict).toHaveBeenCalledWith("c1", "manual_survivor", false, expect.anything());
    expect(container.textContent).toContain("1 left to resolve");
  });

  it("picking the parsed entry resolves parsed_survivor", async () => {
    fetchConflictQueue.mockResolvedValue({ ok: true, conflicts: [makeConflict("c1")] });
    resolveConflict.mockResolvedValue({ ok: true });

    await act(async () => {
      root.render(
        <AppShell>
          <ConflictReviewPanel landingListId="l1" />
        </AppShell>,
      );
    });
    await act(async () => {
      await Promise.resolve();
    });

    const parsedButton = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Keep the imported entry",
    ) as HTMLButtonElement;
    await act(async () => {
      parsedButton.click();
    });

    expect(resolveConflict).toHaveBeenCalledWith("c1", "parsed_survivor", false, expect.anything());
  });

  it("the escape opens a harder confirm before keeping both", async () => {
    fetchConflictQueue.mockResolvedValue({ ok: true, conflicts: [makeConflict("c1")] });
    resolveConflict.mockResolvedValue({ ok: true });

    await act(async () => {
      root.render(
        <AppShell>
          <ConflictReviewPanel landingListId="l1" />
        </AppShell>,
      );
    });
    await act(async () => {
      await Promise.resolve();
    });

    const escapeButton = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Not the same expense",
    ) as HTMLButtonElement;
    await act(async () => {
      escapeButton.click();
    });

    // Escape alone must not resolve anything yet — it only opens the confirm.
    expect(resolveConflict).not.toHaveBeenCalled();
    const confirmDialog = container.querySelector('[role="dialog"]');
    expect(confirmDialog).toBeTruthy();

    const confirmButton = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Keep both",
    ) as HTMLButtonElement;
    await act(async () => {
      confirmButton.click();
    });

    expect(resolveConflict).toHaveBeenCalledWith("c1", "not_same_expense", true, expect.anything());
  });

  it("lands on the list once the queue is empty", async () => {
    fetchConflictQueue.mockResolvedValue({ ok: true, conflicts: [] });

    await act(async () => {
      root.render(
        <AppShell>
          <ConflictReviewPanel landingListId="l1" />
        </AppShell>,
      );
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(push).toHaveBeenCalledWith("/lists/l1");
  });
});
