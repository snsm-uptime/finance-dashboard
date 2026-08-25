/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppShell } from "@/components/AppShell";
import { resetMembershipListsStore } from "@/app/lists/membershipListsStore";
import {
  IndividualReviewPanel,
  nextReviewableRow,
  titleTextareaHeightPx,
} from "./IndividualReviewPanel";
import { formatIbanGroups } from "../../CreditCardFace";
import type { CandidateRow, ImportSession, StagedStatement } from "../../uploadClient";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/upload/review/s1",
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
const undoLastResolution = vi.fn();
const editRowDescription = vi.fn();
const discardSession = vi.fn();
const finalizeSession = vi.fn();
const unassignRow = vi.fn();
vi.mock("../../uploadClient", async () => {
  const actual = await vi.importActual<typeof import("../../uploadClient")>("../../uploadClient");
  return {
    ...actual,
    fetchImportSession: (...args: unknown[]) => fetchImportSession(...args),
    assignRow: (...args: unknown[]) => assignRow(...args),
    deleteRow: (...args: unknown[]) => deleteRow(...args),
    undoLastResolution: (...args: unknown[]) => undoLastResolution(...args),
    editRowDescription: (...args: unknown[]) => editRowDescription(...args),
    discardSession: (...args: unknown[]) => discardSession(...args),
    finalizeSession: (...args: unknown[]) => finalizeSession(...args),
    unassignRow: (...args: unknown[]) => unassignRow(...args),
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
  const rows = overrides.rows ?? [makeRow()];
  return {
    id: "st1",
    product_id: "bac_credit",
    status: "staged",
    iban: null,
    filename: "statement.pdf",
    card_id: null,
    zero_amount_excluded_count: 0,
    ...overrides,
    rows: overrides.rows ?? rows,
    assigned_rows: overrides.assigned_rows ?? [],
    candidate_row_count: overrides.candidate_row_count ?? (overrides.rows ?? rows).length,
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
    deleted_count: 0,
    zero_amount_excluded_count: 0,
    failed_statements: [],
    committed_by_list: [],
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

// The left/right accept buttons show only the list name + an icon visually
// (truncation fix), but keep the full sentence as their accessible name —
// select by that instead of visible text.
function selectByLabel(container: HTMLElement, label: string): HTMLButtonElement {
  return container.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement;
}

// Left/right accept now flings the card (a fixed-delay animation) before the
// actual assign/delete call fires — real timers, so just outlast the delay.
async function waitOutThrow() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 260));
  });
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
function setFieldValue(field: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto =
    field instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
  setter.call(field, value);
  field.dispatchEvent(new Event("input", { bubbles: true }));
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

  it("skips staged-discarded pending row ids", () => {
    const statement = makeStatement({ rows: [ROW_1, ROW_2] });
    const session = makeSession({ statements: [statement] });
    expect(nextReviewableRow(session, new Set(["r1"]))).toEqual({ row: ROW_2, statement });
    expect(nextReviewableRow(session, new Set(["r1", "r2"]))).toBeNull();
  });
});

describe("titleTextareaHeightPx", () => {
  it("never shrinks below the original title height", () => {
    expect(titleTextareaHeightPx(20, 20, 40)).toBe(40);
  });

  it("grows in whole line increments when content is taller", () => {
    expect(titleTextareaHeightPx(41, 20, 40)).toBe(60);
  });
});

describe("IndividualReviewPanel", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    sessionStorage.clear();
    push.mockReset();
    discardSession.mockReset();
    fetchLists.mockReset();
    fetchImportSession.mockReset();
    assignRow.mockReset();
    deleteRow.mockReset();
    undoLastResolution.mockReset();
    editRowDescription.mockReset();
    finalizeSession.mockReset();
    unassignRow.mockReset();
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
    resetMembershipListsStore();
  });

  it("has no full-screen dark overlay", async () => {
    fetchImportSession.mockResolvedValue({ ok: true, session: SESSION_ONE_PENDING });
    fetchLists.mockResolvedValue({
      ok: true,
      lists: [{ id: "l2", name: "Personal", owner_id: "u1", role: "owner" }],
    });
    stubAuthMeFetch(null);

    await act(async () => {
      root.render(<IndividualReviewPanel sessionId="s1" />);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const main = container.querySelector("main")!;
    expect(main.className).not.toMatch(/bg-black/);
    expect(main.className).not.toMatch(/fixed/);
  });

  it("caps the expense card column on narrow viewports so side actions stay readable", async () => {
    fetchImportSession.mockResolvedValue({ ok: true, session: SESSION_ONE_PENDING });
    fetchLists.mockResolvedValue({ ok: true, lists: [] });
    stubAuthMeFetch(null);

    await act(async () => {
      root.render(<IndividualReviewPanel sessionId="s1" />);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const grid = [...container.querySelectorAll("div")].find((el) =>
      el.className.includes("grid-cols-[minmax(0,1fr)_minmax(0,14rem)_minmax(0,1fr)]"),
    );
    expect(grid).toBeTruthy();
    expect(grid?.className).toContain(
      "md:grid-cols-[minmax(0,1fr)_minmax(0,26rem)_minmax(0,1fr)]",
    );
  });

  it("renders keyboard-variant direction hint with arrow keycaps, not inline unicode arrows in copy", async () => {
    fetchImportSession.mockResolvedValue({ ok: true, session: SESSION_ONE_PENDING });
    fetchLists.mockResolvedValue({ ok: true, lists: [] });
    stubAuthMeFetch(null);

    await act(async () => {
      root.render(<IndividualReviewPanel sessionId="s1" />);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Use the");
    expect(container.textContent).toContain("arrow keys");
    const hintKbds = [...container.querySelectorAll("kbd")].filter((el) =>
      el.className.includes("bg-surface"),
    );
    expect(hintKbds.map((el) => el.textContent)).toEqual(["←", "→"]);
    expect(hintKbds.every((el) => el.className.includes("text-accent"))).toBe(true);
  });

  it("renders a drag hint on coarse pointers instead of arrow-key keycaps", async () => {
    stubCoarsePointer();
    fetchImportSession.mockResolvedValue({ ok: true, session: SESSION_ONE_PENDING });
    fetchLists.mockResolvedValue({ ok: true, lists: [] });
    stubAuthMeFetch(null);

    await act(async () => {
      root.render(<IndividualReviewPanel sessionId="s1" />);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Drag the card to the corresponding side");
    expect(container.textContent).not.toContain("arrow keys");
    expect(container.querySelectorAll("kbd")).toHaveLength(0);
  });

  it("reuses CreditCardFace for the card-identification block when the statement has an IBAN", async () => {
    const statement = makeStatement({ iban: "CR00000000000000000000" });
    const session = makeSession({ statements: [statement] });
    fetchImportSession.mockResolvedValue({ ok: true, session });
    fetchLists.mockResolvedValue({ ok: true, lists: [] });
    stubAuthMeFetch(null);

    await act(async () => {
      root.render(<IndividualReviewPanel sessionId="s1" />);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain(`IBAN: ${formatIbanGroups(statement.iban!)}`);
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

    const acceptButton = selectByLabel(container, "Accept to Choose list");
    expect(acceptButton.disabled).toBe(true);

    await openAndChoose(container, "Groceries");
    const acceptButtonAfterPick = selectByLabel(container, "Accept to Groceries");
    expect(acceptButtonAfterPick.disabled).toBe(false);

    assignRow.mockResolvedValue({
      ok: true,
      session: makeSession({ statements: [makeStatement({ rows: [] })] }),
    });

    await act(async () => {
      acceptButtonAfterPick.click();
    });
    await waitOutThrow();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(assignRow).toHaveBeenCalledWith("s1", "r1", "l1", expect.anything());
  });

  it("default-list Add commits to Personal without requiring a picker selection", async () => {
    fetchImportSession.mockResolvedValue({ ok: true, session: SESSION_ONE_PENDING });
    fetchLists.mockResolvedValue({
      ok: true,
      lists: [{ id: "l2", name: "Personal", owner_id: "u1", role: "owner" }],
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

    const defaultButton = selectByLabel(container, "Add to Personal");
    expect(defaultButton.disabled).toBe(false);

    await act(async () => {
      defaultButton.click();
    });
    await waitOutThrow();
    await act(async () => {
      await Promise.resolve();
    });

    expect(assignRow).toHaveBeenCalledWith("s1", "r1", "l2", expect.anything());
  });

  it("omits the default list from the picker", async () => {
    fetchImportSession.mockResolvedValue({ ok: true, session: SESSION_ONE_PENDING });
    fetchLists.mockResolvedValue({
      ok: true,
      lists: [
        { id: "l1", name: "Groceries", owner_id: "u1", role: "owner" },
        { id: "l2", name: "Personal", owner_id: "u1", role: "owner" },
      ],
    });
    stubAuthMeFetch("l2");

    await act(async () => {
      root.render(<IndividualReviewPanel sessionId="s1" />);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const trigger = container.querySelector('button[aria-haspopup="listbox"]') as HTMLButtonElement;
    await act(async () => {
      trigger.click();
    });
    const optionLabels = Array.from(container.querySelectorAll('[role="option"]')).map(
      (el) => el.textContent,
    );
    expect(optionLabels).toContain("Groceries");
    expect(optionLabels).not.toContain("Personal");
  });

  it("Delete stages the row without calling deleteRow or assign", async () => {
    fetchImportSession.mockResolvedValue({ ok: true, session: SESSION_ONE_PENDING });
    fetchLists.mockResolvedValue({ ok: true, lists: [] });
    stubAuthMeFetch(null);

    await act(async () => {
      root.render(<IndividualReviewPanel sessionId="s1" />);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const deleteButton = selectByLabel(container, "Delete");
    await act(async () => {
      deleteButton.click();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(deleteRow).not.toHaveBeenCalled();
    expect(assignRow).not.toHaveBeenCalled();
    expect(selectByText(document.body, "Save")).not.toBeNull();
    expect(document.body.textContent).toContain("Discarded");
    expect(document.body.textContent).toContain("Coffee");
  });

  it("Undo is disabled with no undo pointer, and restores a staged card-discard without calling the server", async () => {
    // Two rows: staging-discard the first must leave the queue non-empty so the
    // four-direction card (and its Undo button) is still on screen — an
    // empty queue renders the confirm sheet instead, which
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

    const deleteButton = selectByLabel(container, "Delete");
    await act(async () => {
      deleteButton.click();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(deleteRow).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Lunch");

    const undoButtonAfter = selectByText(container, "Undo");
    expect(undoButtonAfter.disabled).toBe(false);

    await act(async () => {
      undoButtonAfter.click();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(undoLastResolution).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Coffee");
  });

  it("card-identification gating blocks accept for an unregistered IBAN but not delete", async () => {
    const statement = makeStatement({ iban: "CR00000000000000000000" });
    const session = makeSession({ statements: [statement] });
    fetchImportSession.mockResolvedValue({ ok: true, session });
    fetchLists.mockResolvedValue({
      ok: true,
      lists: [{ id: "l-personal", name: "Personal", owner_id: "u1", role: "owner" }],
    });
    // Also stands in for the identify-card fetch: its shape has no `matched`
    // field, so identifyCardForStatement fails and needsRegistration flips on.
    stubAuthMeFetch("l-personal");

    await act(async () => {
      root.render(<IndividualReviewPanel sessionId="s1" />);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const defaultButton = selectByLabel(container, "Add to Personal");
    const chosenButton = selectByLabel(container, "Accept to Choose list");
    const deleteButton = selectByLabel(container, "Delete");

    expect(defaultButton.disabled).toBe(true);
    expect(chosenButton.disabled).toBe(true);
    expect(deleteButton.disabled).toBe(false);
    expect(container.querySelector('button[aria-haspopup="listbox"]')).toBeNull();
  });

  it("chrome back discards the session then navigates to /upload", async () => {
    fetchImportSession.mockResolvedValue({ ok: true, session: SESSION_ONE_PENDING });
    fetchLists.mockResolvedValue({ ok: true, lists: [] });
    stubAuthMeFetch(null);
    discardSession.mockResolvedValue({ ok: true });

    await act(async () => {
      root.render(
        <AppShell>
          <IndividualReviewPanel sessionId="s1" />
        </AppShell>,
      );
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const header = container.querySelector("header")!;
    const back = header.querySelector('button[aria-label="Back"]') as HTMLButtonElement;
    await act(async () => {
      back.click();
    });
    await act(async () => {
      await Promise.resolve();
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
    const acceptButton = selectByLabel(container, "Accept to Groceries");

    assignRow.mockResolvedValue({
      ok: true,
      session: makeSession({ statements: [makeStatement({ rows: [] })], landing_list_id: "l1" }),
    });

    await act(async () => {
      acceptButton.click();
    });
    await waitOutThrow();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(push).not.toHaveBeenCalled();
    expect(selectByText(document.body, "Save")).toBeTruthy();
    expect(document.body.textContent).toContain("Confirm placements");
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

    const acceptButton = selectByLabel(container, "Accept to Groceries");
    await act(async () => {
      acceptButton.click();
    });
    await waitOutThrow();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(assignRow).toHaveBeenCalledWith("s1", "r1", "l1", expect.anything());

    // The picker must still show Groceries selected for row r2 — pre-fix
    // behavior reset it to "" after every action.
    const trigger = container.querySelector('button[aria-haspopup="listbox"]') as HTMLButtonElement;
    expect(trigger.textContent).toContain("Groceries");
    const chosenButtonForNextRow = selectByLabel(container, "Accept to Groceries");
    expect(chosenButtonForNextRow.disabled).toBe(false);
  });

  it("real swipe handler: right accepts chosen, left accepts default, up deletes, down is a no-op, short drags are no-ops", async () => {
    stubCoarsePointer();
    fetchImportSession.mockResolvedValue({ ok: true, session: SESSION_ONE_PENDING });
    fetchLists.mockResolvedValue({
      ok: true,
      lists: [
        { id: "l1", name: "Groceries", owner_id: "u1", role: "owner" },
        { id: "l2", name: "Personal", owner_id: "u1", role: "owner" },
      ],
    });
    stubAuthMeFetch("l2");
    assignRow.mockResolvedValue({ ok: true, session: SESSION_ONE_PENDING });

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

    // Swipe right past the threshold: accept to the chosen list (fling delay
    // before the actual call, same as the button path).
    await act(async () => {
      capturedDragHandler!({ last: true, movement: [120, 0], velocity: [2, 0], direction: [1, 0] });
    });
    await waitOutThrow();
    await act(async () => {
      await Promise.resolve();
    });
    expect(assignRow).toHaveBeenCalledWith("s1", "r1", "l1", expect.anything());

    // Swipe left past the threshold: accept to the default list.
    await act(async () => {
      capturedDragHandler!({ last: true, movement: [-120, 0], velocity: [2, 0], direction: [-1, 0] });
    });
    await waitOutThrow();
    await act(async () => {
      await Promise.resolve();
    });
    expect(assignRow).toHaveBeenCalledWith("s1", "r1", "l2", expect.anything());

    // Swipe up past the threshold: stage-discard, no server delete.
    await act(async () => {
      capturedDragHandler!({ last: true, movement: [0, -120], velocity: [0, 2], direction: [0, -1] });
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(deleteRow).not.toHaveBeenCalled();

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

  it("ArrowRight key accepts to the chosen list", async () => {
    fetchImportSession.mockResolvedValue({ ok: true, session: SESSION_ONE_PENDING });
    fetchLists.mockResolvedValue({
      ok: true,
      lists: [{ id: "l1", name: "Groceries", owner_id: "u1", role: "owner" }],
    });
    stubAuthMeFetch(null);
    assignRow.mockResolvedValue({ ok: true, session: SESSION_ONE_PENDING });

    await act(async () => {
      root.render(<IndividualReviewPanel sessionId="s1" />);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await openAndChoose(container, "Groceries");

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });
    await waitOutThrow();
    await act(async () => {
      await Promise.resolve();
    });

    expect(assignRow).toHaveBeenCalledWith("s1", "r1", "l1", expect.anything());
  });

  it("ArrowLeft key accepts to the default list", async () => {
    fetchImportSession.mockResolvedValue({ ok: true, session: SESSION_ONE_PENDING });
    fetchLists.mockResolvedValue({
      ok: true,
      lists: [{ id: "l2", name: "Personal", owner_id: "u1", role: "owner" }],
    });
    stubAuthMeFetch("l2");
    assignRow.mockResolvedValue({ ok: true, session: SESSION_ONE_PENDING });

    await act(async () => {
      root.render(<IndividualReviewPanel sessionId="s1" />);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    });
    await waitOutThrow();
    await act(async () => {
      await Promise.resolve();
    });

    expect(assignRow).toHaveBeenCalledWith("s1", "r1", "l2", expect.anything());
  });

  it("arrow keys still preventDefault while a throw is in flight so the page cannot pan", async () => {
    fetchImportSession.mockResolvedValue({ ok: true, session: SESSION_ONE_PENDING });
    fetchLists.mockResolvedValue({
      ok: true,
      lists: [{ id: "l2", name: "Personal", owner_id: "u1", role: "owner" }],
    });
    stubAuthMeFetch("l2");
    assignRow.mockResolvedValue({ ok: true, session: SESSION_ONE_PENDING });

    await act(async () => {
      root.render(<IndividualReviewPanel sessionId="s1" />);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, cancelable: true }));
    });

    const duringThrow = new KeyboardEvent("keydown", {
      key: "ArrowLeft",
      bubbles: true,
      cancelable: true,
    });
    await act(async () => {
      window.dispatchEvent(duringThrow);
    });
    expect(duringThrow.defaultPrevented).toBe(true);

    await waitOutThrow();
    expect(assignRow).toHaveBeenCalledTimes(1);
  });

  it("arrow keys are ignored while the title input is focused", async () => {
    fetchImportSession.mockResolvedValue({ ok: true, session: SESSION_ONE_PENDING });
    fetchLists.mockResolvedValue({
      ok: true,
      lists: [{ id: "l2", name: "Personal", owner_id: "u1", role: "owner" }],
    });
    stubAuthMeFetch(null);

    await act(async () => {
      root.render(<IndividualReviewPanel sessionId="s1" />);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const clickable = (
      Array.from(container.querySelectorAll("div")).find(
        (el) => el.textContent === "Coffee",
      ) as HTMLElement
    ).closest("div")!;
    await act(async () => {
      clickable.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await act(async () => {
      clickable.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const field = container.querySelector("textarea") as HTMLTextAreaElement;

    await act(async () => {
      field.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    });
    await waitOutThrow();

    expect(assignRow).not.toHaveBeenCalled();
  });

  it("arrow keys are ignored while the list picker trigger is focused (not a native <select>)", async () => {
    fetchImportSession.mockResolvedValue({ ok: true, session: SESSION_ONE_PENDING });
    fetchLists.mockResolvedValue({
      ok: true,
      lists: [
        { id: "l1", name: "Groceries", owner_id: "u1", role: "owner" },
        { id: "l2", name: "Personal", owner_id: "u1", role: "owner" },
      ],
    });
    stubAuthMeFetch(null);

    await act(async () => {
      root.render(<IndividualReviewPanel sessionId="s1" />);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const trigger = container.querySelector('button[aria-haspopup="listbox"]') as HTMLButtonElement;
    await act(async () => {
      trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    });
    await waitOutThrow();

    expect(assignRow).not.toHaveBeenCalled();
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

    it("first click primes (soft border, no field); second click mounts and focuses a textarea with the original text", async () => {
      await renderWithSession(SESSION_ONE_PENDING);

      expect(container.querySelector("textarea")).toBeNull();
      const title = Array.from(container.querySelectorAll("h2, div")).find(
        (el) => el.textContent === "Coffee",
      ) as HTMLElement;
      const clickable = title.closest("div")!;

      await act(async () => {
        clickable.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      expect(container.querySelector("textarea")).toBeNull();

      await act(async () => {
        clickable.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      const field = container.querySelector("textarea") as HTMLTextAreaElement;
      expect(field).not.toBeNull();
      expect(field.value).toBe("Coffee");
      expect(document.activeElement).toBe(field);
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
      const field = container.querySelector("textarea") as HTMLTextAreaElement;

      await act(async () => {
        field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
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
      const field = container.querySelector("textarea") as HTMLTextAreaElement;

      await act(async () => {
        setFieldValue(field, "   ");
      });
      await act(async () => {
        field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
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
      const field = container.querySelector("textarea") as HTMLTextAreaElement;

      await act(async () => {
        setFieldValue(field, "  Espresso  ");
      });
      await act(async () => {
        field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
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
      const field = container.querySelector("textarea") as HTMLTextAreaElement;
      await act(async () => {
        setFieldValue(field, "Something else");
      });

      await act(async () => {
        field.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      });

      expect(container.querySelector("textarea")).toBeNull();
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
      expect(container.querySelector("textarea")).toBeNull();
      expect(editRowDescription).not.toHaveBeenCalled();
    });

    it("outside pointerdown from editing with changed text commits via editRowDescription", async () => {
      await renderWithSession(SESSION_ONE_PENDING);
      const afterEdit = makeSession({
        statements: [makeStatement({ rows: [makeRow({ description: "Espresso" })] })],
      });
      editRowDescription.mockResolvedValue({ ok: true, session: afterEdit });
      const clickable = (Array.from(container.querySelectorAll("div")).find(
        (el) => el.textContent === "Coffee",
      ) as HTMLElement).closest("div")!;

      await act(async () => {
        clickable.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await act(async () => {
        clickable.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      const field = container.querySelector("textarea") as HTMLTextAreaElement;
      await act(async () => {
        setFieldValue(field, "  Espresso  ");
      });

      await act(async () => {
        dispatchOutsidePointerDown();
      });
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(editRowDescription).toHaveBeenCalledWith("s1", "r1", "Espresso", expect.anything());
      expect(container.querySelector("textarea")).toBeNull();
      expect(container.textContent).toContain("Espresso");
    });

    it("Ctrl+Z after a committed title edit PATCHes the previous description", async () => {
      await renderWithSession(SESSION_ONE_PENDING);
      const afterEdit = makeSession({
        statements: [makeStatement({ rows: [makeRow({ description: "Espresso" })] })],
      });
      editRowDescription
        .mockResolvedValueOnce({ ok: true, session: afterEdit })
        .mockResolvedValueOnce({ ok: true, session: SESSION_ONE_PENDING });
      const clickable = (Array.from(container.querySelectorAll("div")).find(
        (el) => el.textContent === "Coffee",
      ) as HTMLElement).closest("div")!;

      await act(async () => {
        clickable.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await act(async () => {
        clickable.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      const field = container.querySelector("textarea") as HTMLTextAreaElement;
      await act(async () => {
        setFieldValue(field, "Espresso");
      });
      await act(async () => {
        field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      });
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(editRowDescription).toHaveBeenCalledWith("s1", "r1", "Espresso", expect.anything());

      await act(async () => {
        window.dispatchEvent(
          new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true }),
        );
      });
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(editRowDescription).toHaveBeenCalledWith("s1", "r1", "Coffee", expect.anything());
      expect(container.textContent).toContain("Coffee");
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
      expect(container.querySelector("textarea")).not.toBeNull();

      const deleteButton = selectByLabel(container, "Delete");
      await act(async () => {
        deleteButton.click();
      });
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(container.querySelector("textarea")).toBeNull();
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
      const field = container.querySelector("textarea") as HTMLTextAreaElement;
      await act(async () => {
        setFieldValue(field, "Espresso");
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
        field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      });
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(fetchImportSession).toHaveBeenCalledTimes(2);
      expect(container.textContent).toContain("Lunch");
      expect(container.querySelector("textarea")).toBeNull();
    });
  });

  describe("ImportReviewSheet trigger (Story 4.13.1)", () => {
    // Sheet renders via createPortal(..., document.body) — outside `container`
    // — so assertions in this block query document.body, not container.
    async function renderWithSession(session: ImportSession) {
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
    }

    function assignedRow(overrides: Partial<CandidateRow> = {}): CandidateRow {
      return makeRow({
        status: "committed",
        resolved_list_id: "l1",
        dedup_skipped: false,
        ...overrides,
      });
    }

    it("zero pending rows + not finalized renders the sheet instead of redirecting", async () => {
      const session = makeSession({
        statements: [
          makeStatement({
            rows: [],
            assigned_rows: [assignedRow({ id: "r1", description: "Coffee" })],
          }),
        ],
      });

      await renderWithSession(session);

      expect(push).not.toHaveBeenCalled();
      expect(document.body.textContent).toContain("Coffee");
      expect(document.body.textContent).toContain("Groceries");
      expect(selectByText(document.body, "Save")).not.toBeNull();
    });

    it("an empty assigned set still renders the sheet with Save", async () => {
      const session = makeSession({
        statements: [makeStatement({ rows: [], assigned_rows: [] })],
      });

      await renderWithSession(session);

      expect(push).not.toHaveBeenCalled();
      expect(selectByText(document.body, "Save")).not.toBeNull();
    });

    it("a duplicate-skipped row shows no discard control", async () => {
      const session = makeSession({
        statements: [
          makeStatement({
            rows: [],
            assigned_rows: [
              assignedRow({ id: "r1", description: "Coffee", dedup_skipped: true }),
            ],
          }),
        ],
      });

      await renderWithSession(session);

      expect(document.body.textContent).toContain("Already in this list");
      expect(selectByLabel(document.body, "Discard")).toBeNull();
    });

    it("Save calls finalizeSession and lands on landing_list_id", async () => {
      const session = makeSession({
        statements: [
          makeStatement({ rows: [], assigned_rows: [assignedRow({ id: "r1" })] }),
        ],
      });
      await renderWithSession(session);
      finalizeSession.mockResolvedValue({
        ok: true,
        session: makeSession({
          finalized_at: "2026-08-24T00:00:00Z",
          landing_list_id: "l1",
          statements: [makeStatement({ rows: [], assigned_rows: [] })],
        }),
      });

      const saveButton = selectByText(document.body, "Save");
      await act(async () => {
        saveButton.click();
      });
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(finalizeSession).toHaveBeenCalledWith("s1", expect.anything());
      expect(push).toHaveBeenCalledWith("/lists/l1");
    });

    it("Save lands on /lists when landing_list_id is null", async () => {
      const session = makeSession({
        statements: [
          makeStatement({ rows: [], assigned_rows: [assignedRow({ id: "r1" })] }),
        ],
      });
      await renderWithSession(session);
      finalizeSession.mockResolvedValue({
        ok: true,
        session: makeSession({
          finalized_at: "2026-08-24T00:00:00Z",
          landing_list_id: null,
          statements: [makeStatement({ rows: [], assigned_rows: [] })],
        }),
      });

      const saveButton = selectByText(document.body, "Save");
      await act(async () => {
        saveButton.click();
      });
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(push).toHaveBeenCalledWith("/lists");
    });

    it("discarding a row stages it locally without calling unassignRow", async () => {
      const session = makeSession({
        statements: [
          makeStatement({
            rows: [],
            assigned_rows: [assignedRow({ id: "r1", description: "Coffee" })],
          }),
        ],
      });
      await renderWithSession(session);

      const discardButton = selectByLabel(document.body, "Discard");
      await act(async () => {
        discardButton.click();
      });
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(unassignRow).not.toHaveBeenCalled();
      expect(selectByText(document.body, "Save")).not.toBeNull();
      expect(document.body.textContent).toContain("Discarded");
      expect(document.body.textContent).toContain("Coffee");
    });

    it("Change List unassigns the selected row so card review resumes", async () => {
      const session = makeSession({
        statements: [
          makeStatement({
            rows: [],
            assigned_rows: [assignedRow({ id: "r1", description: "Coffee" })],
          }),
        ],
      });
      await renderWithSession(session);
      unassignRow.mockResolvedValue({
        ok: true,
        session: makeSession({
          statements: [
            makeStatement({
              rows: [makeRow({ id: "r1", description: "Coffee" })],
              assigned_rows: [],
            }),
          ],
        }),
      });

      const coffee = document.body.querySelector(
        'input[type="checkbox"][aria-label="Coffee"]',
      ) as HTMLInputElement;
      await act(async () => {
        coffee.click();
      });
      const changeList = selectByText(document.body, "Change List");
      await act(async () => {
        changeList.click();
      });
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(unassignRow).toHaveBeenCalledWith("s1", "r1", expect.anything());
      expect(selectByText(document.body, "Save")).toBeFalsy();
      expect(document.body.textContent).toContain("Coffee");
      expect(selectByLabel(document.body, "Delete")).toBeTruthy();
    });

    it("Save after card trash deletes the staged row then finalizes", async () => {
      fetchImportSession.mockResolvedValue({
        ok: true,
        session: SESSION_ONE_PENDING,
      });
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

      await act(async () => {
        selectByLabel(container, "Delete").click();
      });
      await act(async () => {
        await Promise.resolve();
      });

      expect(document.body.textContent).toContain("Discarded");
      deleteRow.mockResolvedValue({
        ok: true,
        session: makeSession({ statements: [makeStatement({ rows: [] })] }),
      });
      fetchImportSession.mockResolvedValue({
        ok: true,
        session: makeSession({ statements: [makeStatement({ rows: [] })] }),
      });
      finalizeSession.mockResolvedValue({
        ok: true,
        session: makeSession({
          finalized_at: "2026-08-24T00:00:00Z",
          landing_list_id: "l1",
          statements: [makeStatement({ rows: [], assigned_rows: [] })],
        }),
      });

      await act(async () => {
        selectByText(document.body, "Save").click();
      });
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(deleteRow).toHaveBeenCalledWith("s1", "r1", expect.anything());
      expect(finalizeSession).toHaveBeenCalledWith("s1", expect.anything());
      expect(push).toHaveBeenCalledWith("/lists/l1");
    });
  });

  it("does not show the completion summary on an empty queue that is not finalized", async () => {
    fetchImportSession.mockResolvedValue({
      ok: true,
      session: makeSession({ statements: [makeStatement({ rows: [] })] }),
    });
    fetchLists.mockResolvedValue({ ok: true, lists: [] });
    await act(async () => {
      root.render(<IndividualReviewPanel sessionId="s1" />);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(document.body.textContent).toContain("Confirm placements");
    expect(container.textContent).not.toContain("Import complete");
  });

  it("shows the completion summary when the session is finalized", async () => {
    fetchImportSession.mockResolvedValue({
      ok: true,
      session: makeSession({
        statements: [makeStatement({ rows: [] })],
        finalized_at: "2026-08-24T01:00:00Z",
        imported_new_count: 2,
        deleted_count: 1,
      }),
    });
    fetchLists.mockResolvedValue({ ok: true, lists: [] });
    await act(async () => {
      root.render(<IndividualReviewPanel sessionId="s1" />);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Import complete");
    expect(container.textContent).not.toContain("All caught up for now.");
  });
});
