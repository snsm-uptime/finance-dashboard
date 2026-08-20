/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { IndividualReviewPanel } from "./IndividualReviewPanel";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const fetchLists = vi.fn();
vi.mock("@/app/lists/listsClient", async () => {
  const actual = await vi.importActual<typeof import("@/app/lists/listsClient")>(
    "@/app/lists/listsClient",
  );
  return {
    ...actual,
    fetchLists: (...args: unknown[]) => fetchLists(...args),
  };
});

const fetchImportSession = vi.fn();
const commitIndividualStatement = vi.fn();
const skipStatement = vi.fn();
const discardSession = vi.fn();
vi.mock("../../uploadClient", async () => {
  const actual = await vi.importActual<typeof import("../../uploadClient")>("../../uploadClient");
  return {
    ...actual,
    fetchImportSession: (...args: unknown[]) => fetchImportSession(...args),
    commitIndividualStatement: (...args: unknown[]) => commitIndividualStatement(...args),
    skipStatement: (...args: unknown[]) => skipStatement(...args),
    discardSession: (...args: unknown[]) => discardSession(...args),
  };
});

vi.mock("@/components/PreferencesProvider", () => ({
  usePreferences: () => ({ locale: "en", theme: "light" }),
}));

type DragState = {
  last: boolean;
  movement: [number, number];
  velocity: [number, number];
  direction: [number, number];
};

let capturedDragHandler: ((state: DragState) => void) | undefined;
vi.mock("@use-gesture/react", () => ({
  useDrag: (handler: (state: DragState) => void) => {
    capturedDragHandler = handler;
    return undefined;
  },
}));

function stubCoarsePointer() {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === "(pointer: coarse)",
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

const SESSION_ONE_STAGED = {
  id: "s1",
  created_at: "2026-08-19T00:00:00Z",
  discarded_at: null,
  statements: [
    { id: "st1", product_id: "bac_credit", status: "staged" as const, candidate_row_count: 3 },
  ],
};

function selectByText(container: HTMLElement, text: string): HTMLButtonElement {
  return Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === text,
  ) as HTMLButtonElement;
}

async function openAndChoose(container: HTMLElement, label: string) {
  const trigger = container.querySelector('button[aria-haspopup="listbox"]') as HTMLButtonElement;
  await act(async () => {
    trigger.click();
  });
  const option = Array.from(container.querySelectorAll('[role="option"]')).find(
    (el) => el.textContent === label,
  ) as HTMLElement;
  await act(async () => {
    option.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  });
}

function stubAuthMeFetch(defaultImportListId: string | null) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ default_import_list_id: defaultImportListId }),
    }),
  );
}

describe("IndividualReviewPanel", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    push.mockReset();
    fetchLists.mockReset();
    fetchImportSession.mockReset();
    commitIndividualStatement.mockReset();
    skipStatement.mockReset();
    discardSession.mockReset();
    capturedDragHandler = undefined;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
  });

  it("chosen-list Accept is disabled until a list is picked, then commits and advances", async () => {
    fetchImportSession.mockResolvedValue({ ok: true, session: SESSION_ONE_STAGED });
    fetchLists.mockResolvedValue({
      ok: true,
      lists: [{ id: "l1", name: "Groceries", owner_id: "u1", role: "owner" }],
    });
    stubAuthMeFetch(null);

    await act(async () => {
      root.render(<IndividualReviewPanel sessionId="s1" />);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const acceptButton = selectByText(container, "Accept to Choose list");
    expect(acceptButton.disabled).toBe(true);

    await openAndChoose(container, "Groceries");
    const acceptButtonAfterPick = selectByText(container, "Accept to Groceries");
    expect(acceptButtonAfterPick.disabled).toBe(false);

    commitIndividualStatement.mockResolvedValue({
      ok: true,
      session: { ...SESSION_ONE_STAGED, statements: [] },
    });

    await act(async () => {
      acceptButtonAfterPick.click();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(commitIndividualStatement).toHaveBeenCalledWith("s1", "st1", "l1", expect.anything());
  });

  it("default-list Add commits with default_import_list_id without requiring a picker selection", async () => {
    fetchImportSession.mockResolvedValue({ ok: true, session: SESSION_ONE_STAGED });
    fetchLists.mockResolvedValue({
      ok: true,
      lists: [{ id: "l2", name: "Household", owner_id: "u1", role: "member" }],
    });
    stubAuthMeFetch("l2");
    commitIndividualStatement.mockResolvedValue({
      ok: true,
      session: {
        ...SESSION_ONE_STAGED,
        statements: [{ ...SESSION_ONE_STAGED.statements[0], status: "committed" }],
      },
    });

    await act(async () => {
      root.render(<IndividualReviewPanel sessionId="s1" />);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const defaultButton = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.startsWith("Add to"),
    ) as HTMLButtonElement;
    expect(defaultButton.disabled).toBe(false);

    await act(async () => {
      defaultButton.click();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(commitIndividualStatement).toHaveBeenCalledWith("s1", "st1", "l2", expect.anything());
  });

  it("Skip advances without calling commit", async () => {
    fetchImportSession.mockResolvedValue({ ok: true, session: SESSION_ONE_STAGED });
    fetchLists.mockResolvedValue({ ok: true, lists: [] });
    stubAuthMeFetch(null);
    skipStatement.mockResolvedValue({
      ok: true,
      session: {
        ...SESSION_ONE_STAGED,
        statements: [{ ...SESSION_ONE_STAGED.statements[0], status: "skipped" }],
      },
    });

    await act(async () => {
      root.render(<IndividualReviewPanel sessionId="s1" />);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const skipButton = selectByText(container, "Skip");
    await act(async () => {
      skipButton.click();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(skipStatement).toHaveBeenCalledWith("s1", "st1", expect.anything());
    expect(commitIndividualStatement).not.toHaveBeenCalled();
  });

  it("Accept is disabled for a failed statement — only Skip/Dismiss are usable", async () => {
    const failedSession = {
      ...SESSION_ONE_STAGED,
      statements: [{ ...SESSION_ONE_STAGED.statements[0], status: "failed" as const }],
    };
    fetchImportSession.mockResolvedValue({ ok: true, session: failedSession });
    fetchLists.mockResolvedValue({
      ok: true,
      lists: [{ id: "l1", name: "Groceries", owner_id: "u1", role: "owner" }],
    });
    stubAuthMeFetch("l1");

    await act(async () => {
      root.render(<IndividualReviewPanel sessionId="s1" />);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const acceptButton = selectByText(container, "Accept to Choose list");
    const defaultButton = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.startsWith("Add to"),
    ) as HTMLButtonElement;
    const skipButton = selectByText(container, "Skip");

    expect(acceptButton.disabled).toBe(true);
    expect(defaultButton.disabled).toBe(true);
    expect(skipButton.disabled).toBe(false);
  });

  it("Dismiss file calls discardSession and navigates to /upload", async () => {
    fetchImportSession.mockResolvedValue({ ok: true, session: SESSION_ONE_STAGED });
    fetchLists.mockResolvedValue({ ok: true, lists: [] });
    stubAuthMeFetch(null);
    discardSession.mockResolvedValue({ ok: true });

    await act(async () => {
      root.render(<IndividualReviewPanel sessionId="s1" />);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const dismissButton = selectByText(container, "Dismiss file");
    await act(async () => {
      dismissButton.click();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(discardSession).toHaveBeenCalledWith("s1", expect.anything());
    expect(push).toHaveBeenCalledWith("/upload");
  });

  it("navigates to the accepted list's shared-expenses view once no statements remain", async () => {
    fetchImportSession.mockResolvedValue({ ok: true, session: SESSION_ONE_STAGED });
    fetchLists.mockResolvedValue({
      ok: true,
      lists: [{ id: "l1", name: "Groceries", owner_id: "u1", role: "owner" }],
    });
    stubAuthMeFetch(null);

    await act(async () => {
      root.render(<IndividualReviewPanel sessionId="s1" />);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await openAndChoose(container, "Groceries");
    const acceptButton = selectByText(container, "Accept to Groceries");

    commitIndividualStatement.mockResolvedValue({
      ok: true,
      session: { ...SESSION_ONE_STAGED, statements: [] },
    });

    await act(async () => {
      acceptButton.click();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(push).toHaveBeenCalledWith("/lists/l1");
  });

  it("real swipe handler: right accepts chosen, left accepts default, down skips, short drags are no-ops", async () => {
    stubCoarsePointer();
    fetchImportSession.mockResolvedValue({ ok: true, session: SESSION_ONE_STAGED });
    fetchLists.mockResolvedValue({
      ok: true,
      lists: [{ id: "l1", name: "Groceries", owner_id: "u1", role: "owner" }],
    });
    stubAuthMeFetch("l2");
    commitIndividualStatement.mockResolvedValue({ ok: true, session: SESSION_ONE_STAGED });
    skipStatement.mockResolvedValue({ ok: true, session: SESSION_ONE_STAGED });

    await act(async () => {
      root.render(<IndividualReviewPanel sessionId="s1" />);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await openAndChoose(container, "Groceries");

    expect(capturedDragHandler).toBeTypeOf("function");

    // Below the distance threshold on both axes: no action fires.
    await act(async () => {
      capturedDragHandler!({ last: true, movement: [10, 10], velocity: [1, 1], direction: [1, 0] });
    });
    expect(commitIndividualStatement).not.toHaveBeenCalled();
    expect(skipStatement).not.toHaveBeenCalled();

    // Swipe right past the threshold: accept to the chosen list.
    await act(async () => {
      capturedDragHandler!({ last: true, movement: [120, 0], velocity: [2, 0], direction: [1, 0] });
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(commitIndividualStatement).toHaveBeenCalledWith("s1", "st1", "l1", expect.anything());

    // Swipe left past the threshold: accept to the default list.
    await act(async () => {
      capturedDragHandler!({ last: true, movement: [-120, 0], velocity: [2, 0], direction: [-1, 0] });
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(commitIndividualStatement).toHaveBeenCalledWith("s1", "st1", "l2", expect.anything());

    // Swipe down past the threshold: skip.
    await act(async () => {
      capturedDragHandler!({ last: true, movement: [0, 120], velocity: [0, 2], direction: [0, 1] });
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(skipStatement).toHaveBeenCalledWith("s1", "st1", expect.anything());
  });
});
