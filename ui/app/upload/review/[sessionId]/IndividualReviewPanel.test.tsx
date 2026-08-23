/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { IndividualReviewPanel, nextReviewableRow } from "./IndividualReviewPanel";
import type { CandidateRow, ImportSession, StagedStatement } from "../../uploadClient";

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
const assignRow = vi.fn();
const deleteRow = vi.fn();
const discardSession = vi.fn();
const undoLastResolution = vi.fn();
const editRowDescription = vi.fn();
vi.mock("../../uploadClient", async () => {
  const actual = await vi.importActual<typeof import("../../uploadClient")>("../../uploadClient");
  return {
    ...actual,
    fetchImportSession: (...args: unknown[]) => fetchImportSession(...args),
    assignRow: (...args: unknown[]) => assignRow(...args),
    deleteRow: (...args: unknown[]) => deleteRow(...args),
    discardSession: (...args: unknown[]) => discardSession(...args),
    undoLastResolution: (...args: unknown[]) => undoLastResolution(...args),
    editRowDescription: (...args: unknown[]) => editRowDescription(...args),
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

function makeRow(overrides: Partial<CandidateRow> = {}): CandidateRow {
  return {
    id: "r1",
    sequence: 1,
    description: "Coffee",
    amount: "10.00",
    currency: "CRC",
    posted_date: "2026-01-01",
    status: "pending",
    ...overrides,
  };
}

function makeStatement(overrides: Partial<StagedStatement> = {}): StagedStatement {
  return {
    id: "st1",
    product_id: "bac_credit",
    status: "staged",
    candidate_row_count: 3,
    iban: null,
    filename: "statement.pdf",
    card_id: null,
    zero_amount_excluded_count: 0,
    rows: [makeRow()],
    ...overrides,
  };
}

function makeSession(overrides: Partial<ImportSession> = {}): ImportSession {
  return {
    id: "s1",
    created_at: "2026-08-19T00:00:00Z",
    discarded_at: null,
    undo: null,
    statements: [makeStatement()],
    finalized_at: null,
    imported_new_count: 0,
    skipped_duplicate_count: 0,
    landing_list_id: null,
    ...overrides,
  };
}

const ROW_1 = makeRow({ id: "r1", sequence: 1, description: "Coffee" });
const ROW_2 = makeRow({ id: "r2", sequence: 2, description: "Lunch" });
const SESSION_ONE_PENDING = makeSession();

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

function dispatchOutsidePointerDown() {
  document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
}

// React tracks a controlled input's "last known value" via a patched native
// setter, so `input.value = x` alone leaves the tracker already in sync and
// the subsequent "input" event's onChange never fires. Calling the original
// native setter directly (bypassing React's patch) avoids that.
function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!
    .set!;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("nextReviewableRow", () => {
  it("returns null for a null session", () => {
    expect(nextReviewableRow(null)).toBeNull();
  });

  it("returns null for a discarded session", () => {
    const session = makeSession({ discarded_at: "2026-01-01T00:00:00Z" });
    expect(nextReviewableRow(session)).toBeNull();
  });

  it("a session with only a failed statement (empty rows) returns null", () => {
    const session = makeSession({
      statements: [makeStatement({ status: "failed", rows: [] })],
    });
    expect(nextReviewableRow(session)).toBeNull();
  });

  it("flattens multiple statements in statement-then-sequence order", () => {
    const failed = makeStatement({ id: "st-failed", status: "failed", rows: [] });
    const staged = makeStatement({ id: "st-staged", rows: [ROW_2] });
    const session = makeSession({ statements: [failed, staged] });
    expect(nextReviewableRow(session)).toEqual({ row: ROW_2, statement: staged });
  });

  it("a statement with some rows already resolved only surfaces the remaining pending ones", () => {
    // Per the pending-only GET contract (Story 4.11), a resolved row is
    // simply absent from `rows` — there is nothing to filter client-side.
    const remaining = makeRow({ id: "r-remaining", sequence: 2 });
    const statement = makeStatement({ rows: [remaining] });
    const session = makeSession({ statements: [statement] });
    expect(nextReviewableRow(session)).toEqual({ row: remaining, statement });
  });
});

describe("IndividualReviewPanel", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    push.mockReset();
    fetchLists.mockReset();
    fetchImportSession.mockReset();
    assignRow.mockReset();
    deleteRow.mockReset();
    discardSession.mockReset();
    undoLastResolution.mockReset();
    editRowDescription.mockReset();
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
    fetchImportSession.mockResolvedValue({ ok: true, session: SESSION_ONE_PENDING });
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

    assignRow.mockResolvedValue({
      ok: true,
      session: makeSession({ statements: [makeStatement({ rows: [] })] }),
    });

    await act(async () => {
      acceptButtonAfterPick.click();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(assignRow).toHaveBeenCalledWith("s1", "r1", "l1", expect.anything());
  });

  it("default-list Add commits with default_import_list_id without requiring a picker selection", async () => {
    fetchImportSession.mockResolvedValue({ ok: true, session: SESSION_ONE_PENDING });
    fetchLists.mockResolvedValue({
      ok: true,
      lists: [{ id: "l2", name: "Household", owner_id: "u1", role: "member" }],
    });
    stubAuthMeFetch("l2");
    assignRow.mockResolvedValue({
      ok: true,
      session: makeSession({ statements: [makeStatement({ rows: [] })] }),
    });

    await act(async () => {
      root.render(<IndividualReviewPanel sessionId="s1" />);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const defaultButton = selectByText(container, "Add to Household");
    expect(defaultButton.disabled).toBe(false);

    await act(async () => {
      defaultButton.click();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(assignRow).toHaveBeenCalledWith("s1", "r1", "l2", expect.anything());
  });

  it("Delete advances without calling assign", async () => {
    fetchImportSession.mockResolvedValue({ ok: true, session: SESSION_ONE_PENDING });
    fetchLists.mockResolvedValue({ ok: true, lists: [] });
    stubAuthMeFetch(null);
    deleteRow.mockResolvedValue({
      ok: true,
      session: makeSession({ statements: [makeStatement({ rows: [] })] }),
    });

    await act(async () => {
      root.render(<IndividualReviewPanel sessionId="s1" />);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const deleteButton = selectByText(container, "Delete");
    await act(async () => {
      deleteButton.click();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(deleteRow).toHaveBeenCalledWith("s1", "r1", expect.anything());
    expect(assignRow).not.toHaveBeenCalled();
  });

  it("Undo is disabled with no undo pointer, and calls undoLastResolution once available", async () => {
    // Two rows: deleting the first must leave the queue non-empty so the
    // four-direction card (and its Undo button) is still on screen — an
    // empty queue renders the interim placeholder instead (Task 8.2), which
    // has no undo control by design.
    const session = makeSession({ statements: [makeStatement({ rows: [ROW_1, ROW_2] })] });
    fetchImportSession.mockResolvedValue({ ok: true, session });
    fetchLists.mockResolvedValue({ ok: true, lists: [] });
    stubAuthMeFetch(null);

    await act(async () => {
      root.render(<IndividualReviewPanel sessionId="s1" />);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const undoButton = selectByText(container, "Undo");
    expect(undoButton.disabled).toBe(true);

    deleteRow.mockResolvedValue({
      ok: true,
      session: makeSession({
        statements: [makeStatement({ rows: [ROW_2] })],
        undo: { row_id: "r1", action: "delete" },
      }),
    });
    const deleteButton = selectByText(container, "Delete");
    await act(async () => {
      deleteButton.click();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const undoButtonAfter = selectByText(container, "Undo");
    expect(undoButtonAfter.disabled).toBe(false);

    undoLastResolution.mockResolvedValue({
      ok: true,
      session: makeSession({ undo: null }),
    });
    await act(async () => {
      undoButtonAfter.click();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(undoLastResolution).toHaveBeenCalledWith("s1", expect.anything());
  });

  it("card-identification gating blocks accept for an unregistered IBAN but not delete", async () => {
    const statement = makeStatement({ iban: "CR00000000000000000000" });
    const session = makeSession({ statements: [statement] });
    fetchImportSession.mockResolvedValue({ ok: true, session });
    fetchLists.mockResolvedValue({
      ok: true,
      lists: [{ id: "l1", name: "Groceries", owner_id: "u1", role: "owner" }],
    });
    // Also stands in for the identify-card fetch: its shape has no `matched`
    // field, so identifyCardForStatement fails and needsRegistration flips on.
    stubAuthMeFetch("l1");

    await act(async () => {
      root.render(<IndividualReviewPanel sessionId="s1" />);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    await openAndChoose(container, "Groceries");

    const defaultButton = selectByText(container, "Add to Groceries");
    const chosenButton = selectByText(container, "Accept to Groceries");
    const deleteButton = selectByText(container, "Delete");

    expect(defaultButton.disabled).toBe(true);
    expect(chosenButton.disabled).toBe(true);
    expect(deleteButton.disabled).toBe(false);
  });

  it("Dismiss file calls discardSession and navigates to /upload", async () => {
    fetchImportSession.mockResolvedValue({ ok: true, session: SESSION_ONE_PENDING });
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

  it("last-row resolution does not redirect and shows the interim placeholder", async () => {
    fetchImportSession.mockResolvedValue({ ok: true, session: SESSION_ONE_PENDING });
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

    assignRow.mockResolvedValue({
      ok: true,
      session: makeSession({ statements: [makeStatement({ rows: [] })], landing_list_id: "l1" }),
    });

    await act(async () => {
      acceptButton.click();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(push).not.toHaveBeenCalled();
    expect(container.textContent).toContain("All caught up for now.");
  });

  it("picker selection persists across rows after a successful assign (Task 4.1 regression)", async () => {
    const session = makeSession({ statements: [makeStatement({ rows: [ROW_1, ROW_2] })] });
    fetchImportSession.mockResolvedValue({ ok: true, session });
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

    assignRow.mockResolvedValue({
      ok: true,
      session: makeSession({ statements: [makeStatement({ rows: [ROW_2] })] }),
    });

    const acceptButton = selectByText(container, "Accept to Groceries");
    await act(async () => {
      acceptButton.click();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(assignRow).toHaveBeenCalledWith("s1", "r1", "l1", expect.anything());

    // The picker must still show Groceries selected for row r2 — pre-fix
    // behavior reset it to "" after every action.
    const trigger = container.querySelector('button[aria-haspopup="listbox"]') as HTMLButtonElement;
    expect(trigger.textContent).toContain("Groceries");
    const chosenButtonForNextRow = selectByText(container, "Accept to Groceries");
    expect(chosenButtonForNextRow.disabled).toBe(false);
  });

  it("real swipe handler: right accepts chosen, left accepts default, up deletes, down is a no-op, short drags are no-ops", async () => {
    stubCoarsePointer();
    fetchImportSession.mockResolvedValue({ ok: true, session: SESSION_ONE_PENDING });
    fetchLists.mockResolvedValue({
      ok: true,
      lists: [{ id: "l1", name: "Groceries", owner_id: "u1", role: "owner" }],
    });
    stubAuthMeFetch("l2");
    assignRow.mockResolvedValue({ ok: true, session: SESSION_ONE_PENDING });
    deleteRow.mockResolvedValue({ ok: true, session: SESSION_ONE_PENDING });

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
    expect(assignRow).not.toHaveBeenCalled();
    expect(deleteRow).not.toHaveBeenCalled();

    // Swipe right past the threshold: accept to the chosen list.
    await act(async () => {
      capturedDragHandler!({ last: true, movement: [120, 0], velocity: [2, 0], direction: [1, 0] });
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(assignRow).toHaveBeenCalledWith("s1", "r1", "l1", expect.anything());

    // Swipe left past the threshold: accept to the default list.
    await act(async () => {
      capturedDragHandler!({ last: true, movement: [-120, 0], velocity: [2, 0], direction: [-1, 0] });
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(assignRow).toHaveBeenCalledWith("s1", "r1", "l2", expect.anything());

    // Swipe up past the threshold: delete.
    await act(async () => {
      capturedDragHandler!({ last: true, movement: [0, -120], velocity: [0, 2], direction: [0, -1] });
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(deleteRow).toHaveBeenCalledWith("s1", "r1", expect.anything());

    // Swipe down past the threshold: never a gesture — nothing fires.
    deleteRow.mockClear();
    assignRow.mockClear();
    await act(async () => {
      capturedDragHandler!({ last: true, movement: [0, 120], velocity: [0, 2], direction: [0, 1] });
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(assignRow).not.toHaveBeenCalled();
    expect(deleteRow).not.toHaveBeenCalled();
  });

  describe("inline title edit", () => {
    async function renderWithSession(session: ImportSession) {
      fetchImportSession.mockResolvedValue({ ok: true, session });
      fetchLists.mockResolvedValue({ ok: true, lists: [] });
      stubAuthMeFetch(null);

      await act(async () => {
        root.render(<IndividualReviewPanel sessionId="s1" />);
      });
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
    }

    it("first click primes (soft border, no input); second click mounts and focuses the input", async () => {
      await renderWithSession(SESSION_ONE_PENDING);

      expect(container.querySelector("input[value]")).toBeNull();
      const title = Array.from(container.querySelectorAll("h2, div")).find(
        (el) => el.textContent === "Coffee",
      ) as HTMLElement;
      const clickable = title.closest("div")!;

      await act(async () => {
        clickable.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      expect(container.querySelector("input")).toBeNull();

      await act(async () => {
        clickable.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      const input = container.querySelector("input") as HTMLInputElement;
      expect(input).not.toBeNull();
      expect(document.activeElement).toBe(input);
    });

    it("Enter with unchanged text is a no-op (no PATCH call)", async () => {
      await renderWithSession(SESSION_ONE_PENDING);
      const clickable = (Array.from(container.querySelectorAll("div")).find(
        (el) => el.textContent === "Coffee",
      ) as HTMLElement).closest("div")!;

      await act(async () => {
        clickable.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await act(async () => {
        clickable.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      const input = container.querySelector("input") as HTMLInputElement;

      await act(async () => {
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      });

      expect(editRowDescription).not.toHaveBeenCalled();
    });

    it("Enter with emptied text shows an inline error and does not call PATCH", async () => {
      await renderWithSession(SESSION_ONE_PENDING);
      const clickable = (Array.from(container.querySelectorAll("div")).find(
        (el) => el.textContent === "Coffee",
      ) as HTMLElement).closest("div")!;

      await act(async () => {
        clickable.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await act(async () => {
        clickable.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      const input = container.querySelector("input") as HTMLInputElement;

      await act(async () => {
        setInputValue(input, "   ");
      });
      await act(async () => {
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      });

      expect(editRowDescription).not.toHaveBeenCalled();
      expect(container.querySelector('[role="alert"]')?.textContent).toBe("Enter a description.");
    });

    it("Enter with valid changed text calls editRowDescription trimmed", async () => {
      await renderWithSession(SESSION_ONE_PENDING);
      editRowDescription.mockResolvedValue({ ok: true, session: SESSION_ONE_PENDING });
      const clickable = (Array.from(container.querySelectorAll("div")).find(
        (el) => el.textContent === "Coffee",
      ) as HTMLElement).closest("div")!;

      await act(async () => {
        clickable.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await act(async () => {
        clickable.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      const input = container.querySelector("input") as HTMLInputElement;

      await act(async () => {
        setInputValue(input, "  Espresso  ");
      });
      await act(async () => {
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      });
      await act(async () => {
        await Promise.resolve();
      });

      expect(editRowDescription).toHaveBeenCalledWith("s1", "r1", "Espresso", expect.anything());
    });

    it("Escape from editing discards the draft and returns to idle", async () => {
      await renderWithSession(SESSION_ONE_PENDING);
      const clickable = (Array.from(container.querySelectorAll("div")).find(
        (el) => el.textContent === "Coffee",
      ) as HTMLElement).closest("div")!;

      await act(async () => {
        clickable.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await act(async () => {
        clickable.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      const input = container.querySelector("input") as HTMLInputElement;
      await act(async () => {
        setInputValue(input, "Something else");
      });

      await act(async () => {
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      });

      expect(container.querySelector("input")).toBeNull();
      expect(container.textContent).toContain("Coffee");
      expect(editRowDescription).not.toHaveBeenCalled();
    });

    it("outside pointerdown from primed returns to idle without mounting the input", async () => {
      await renderWithSession(SESSION_ONE_PENDING);
      const clickable = (Array.from(container.querySelectorAll("div")).find(
        (el) => el.textContent === "Coffee",
      ) as HTMLElement).closest("div")!;

      await act(async () => {
        clickable.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });

      await act(async () => {
        dispatchOutsidePointerDown();
      });

      // A second click now behaves as a fresh first click (primed again),
      // not a second click continuing toward editing — proof state truly
      // returned to idle rather than staying primed.
      await act(async () => {
        clickable.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      expect(container.querySelector("input")).toBeNull();
    });

    it("row-advance reset: title state returns to idle even if primed/editing on the previous row", async () => {
      const session = makeSession({ statements: [makeStatement({ rows: [ROW_1, ROW_2] })] });
      await renderWithSession(session);
      const clickable = (Array.from(container.querySelectorAll("div")).find(
        (el) => el.textContent === "Coffee",
      ) as HTMLElement).closest("div")!;

      await act(async () => {
        clickable.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await act(async () => {
        clickable.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      expect(container.querySelector("input")).not.toBeNull();

      deleteRow.mockResolvedValue({
        ok: true,
        session: makeSession({ statements: [makeStatement({ rows: [ROW_2] })] }),
      });
      const deleteButton = selectByText(container, "Delete");
      await act(async () => {
        deleteButton.click();
      });
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(container.querySelector("input")).toBeNull();
      expect(container.textContent).toContain("Lunch");
    });

    it("concurrent-edit refresh: import_row_not_available re-fetches instead of showing a stale edit", async () => {
      const session = makeSession({ statements: [makeStatement({ rows: [ROW_1, ROW_2] })] });
      await renderWithSession(session);
      const clickable = (Array.from(container.querySelectorAll("div")).find(
        (el) => el.textContent === "Coffee",
      ) as HTMLElement).closest("div")!;

      await act(async () => {
        clickable.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await act(async () => {
        clickable.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      const input = container.querySelector("input") as HTMLInputElement;
      await act(async () => {
        setInputValue(input, "Espresso");
      });

      editRowDescription.mockResolvedValue({
        ok: false,
        error: "This transaction is no longer available.",
      });
      fetchImportSession.mockResolvedValue({
        ok: true,
        session: makeSession({ statements: [makeStatement({ rows: [ROW_2] })] }),
      });

      await act(async () => {
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      });
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(fetchImportSession).toHaveBeenCalledTimes(2);
      expect(container.textContent).toContain("Lunch");
      expect(container.querySelector("input")).toBeNull();
    });
  });
});
