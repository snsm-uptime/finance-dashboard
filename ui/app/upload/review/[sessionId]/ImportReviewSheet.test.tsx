/** @vitest-environment jsdom */

import { act } from "react";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { groupAssignedRows, groupRowsByDay, ImportReviewSheet } from "./ImportReviewSheet";
import type { CandidateRow, ImportSession, StagedStatement } from "../../uploadClient";
import { formatRowDate } from "./IndividualReviewPanel";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const unassignRow = vi.fn();
const finalizeSession = vi.fn();
const deleteRow = vi.fn();
const fetchImportSession = vi.fn();
vi.mock("../../uploadClient", async () => {
  const actual = await vi.importActual<typeof import("../../uploadClient")>(
    "../../uploadClient",
  );
  return {
    ...actual,
    unassignRow: (...args: unknown[]) => unassignRow(...args),
    finalizeSession: (...args: unknown[]) => finalizeSession(...args),
    deleteRow: (...args: unknown[]) => deleteRow(...args),
    fetchImportSession: (...args: unknown[]) => fetchImportSession(...args),
  };
});

vi.mock("@/components/PreferencesProvider", () => ({
  usePreferences: () => ({ locale: "en" as const }),
}));

vi.mock("@/components/IconButton/IconButton.module.scss", () => ({
  default: new Proxy(
    {},
    {
      get: (_t, prop) => String(prop),
    },
  ),
}));

vi.mock("@/app/lists/Sheet", () => ({
  Sheet: ({
    title,
    body,
    footer,
    closeLabel,
    fillBelowChrome,
  }: {
    title: string;
    body: ReactNode;
    footer?: ReactNode;
    closeLabel: string;
    fillBelowChrome?: boolean;
  }) => (
    <div
      role="dialog"
      aria-label={title}
      data-fill-below-chrome={fillBelowChrome ? "true" : "false"}
    >
      <h2>{title}</h2>
      <button type="button" aria-label={closeLabel}>
        close
      </button>
      <div data-testid="sheet-body">{body}</div>
      {footer ? <div data-testid="sheet-footer">{footer}</div> : null}
    </div>
  ),
}));

function makeRow(overrides: Partial<CandidateRow> = {}): CandidateRow {
  return {
    id: "r1",
    sequence: 1,
    description: "Coffee",
    amount: "10.00",
    currency: "CRC",
    posted_date: "2026-01-15",
    status: "committed",
    resolved_list_id: "list-home",
    dedup_skipped: false,
    ...overrides,
  };
}

function makeStatement(overrides: Partial<StagedStatement> = {}): StagedStatement {
  return {
    id: "st1",
    product_id: "bac_credit",
    status: "committed",
    candidate_row_count: 3,
    iban: null,
    filename: "statement.pdf",
    card_id: null,
    zero_amount_excluded_count: 0,
    rows: [],
    assigned_rows: [],
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
    landing_list_id: "list-home",
    ...overrides,
    deleted_count: overrides.deleted_count ?? 0,
    zero_amount_excluded_count: overrides.zero_amount_excluded_count ?? 0,
    failed_statements: overrides.failed_statements ?? [],
    committed_by_list: overrides.committed_by_list ?? [],
  };
}

const lists = [
  { id: "list-home", name: "Home", owner_id: "u1", role: "owner" },
  { id: "list-trips", name: "Trips", owner_id: "u1", role: "owner" },
];

describe("groupRowsByDay", () => {
  it("buckets by posted date, keeps sequence within a day, and puts unknown dates last", () => {
    const later = makeRow({ id: "r-later", sequence: 1, posted_date: "2026-01-16" });
    const first = makeRow({ id: "r-first", sequence: 2, posted_date: "2026-01-15" });
    const unknown = makeRow({ id: "r-unk", sequence: 3, posted_date: "" });
    const secondSameDay = makeRow({ id: "r-second", sequence: 5, posted_date: "2026-01-15" });

    expect(groupRowsByDay([later, first, unknown, secondSameDay])).toEqual([
      { dateKey: "2026-01-15", rows: [first, secondSameDay] },
      { dateKey: "2026-01-16", rows: [later] },
      { dateKey: "", rows: [unknown] },
    ]);
  });
});

describe("groupAssignedRows", () => {
  it("groups by list name, then by day, skipping rows without resolved_list_id", () => {
    const session = makeSession({
      statements: [
        makeStatement({
          assigned_rows: [
            makeRow({
              id: "trip",
              sequence: 1,
              resolved_list_id: "list-trips",
              posted_date: "2026-01-15",
            }),
            makeRow({
              id: "home-b",
              sequence: 4,
              resolved_list_id: "list-home",
              posted_date: "2026-01-15",
            }),
            makeRow({
              id: "orphan",
              sequence: 2,
              resolved_list_id: null,
            }),
            makeRow({
              id: "home-a",
              sequence: 1,
              resolved_list_id: "list-home",
              posted_date: "2026-01-16",
            }),
          ],
        }),
      ],
    });

    const groups = groupAssignedRows(session, lists);
    expect(groups.map((g) => g.listName)).toEqual(["Home", "Trips"]);
    expect(groups[0].days.map((d) => d.dateKey)).toEqual(["2026-01-15", "2026-01-16"]);
    expect(groups[0].days[0].rows.map((r) => r.id)).toEqual(["home-b"]);
    expect(groups[0].days[1].rows.map((r) => r.id)).toEqual(["home-a"]);
  });
});

describe("ImportReviewSheet", () => {
  let container: HTMLDivElement;
  let root: Root;
  let session: ImportSession;

  beforeEach(() => {
    localStorage.clear();
    push.mockReset();
    unassignRow.mockReset();
    finalizeSession.mockReset();
    deleteRow.mockReset();
    fetchImportSession.mockReset();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    session = makeSession({
      statements: [
        makeStatement({
          assigned_rows: [
            makeRow({
              id: "r-coffee",
              sequence: 2,
              description: "Coffee",
              posted_date: "2026-01-15",
            }),
            makeRow({
              id: "r-lunch",
              sequence: 1,
              description: "Lunch",
              posted_date: "2026-01-16",
            }),
            makeRow({
              id: "r-dup",
              sequence: 3,
              description: "Netflix",
              posted_date: "2026-01-15",
              dedup_skipped: true,
            }),
            makeRow({
              id: "r-unk",
              sequence: 4,
              description: "Mystery",
              posted_date: "",
            }),
          ],
        }),
      ],
    });
    fetchImportSession.mockResolvedValue({ ok: true, session });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  async function renderSheet(nextSession = session) {
    await act(async () => {
      root.render(
        <ImportReviewSheet
          sessionId="s1"
          session={nextSession}
          lists={lists}
          onSessionUpdate={vi.fn()}
          onClose={vi.fn()}
        />,
      );
    });
  }

  it("renders day headings in date order with unknown last, sequence within a day", async () => {
    await renderSheet();
    const headings = [...container.querySelectorAll("h4")].map((el) => el.textContent);
    expect(headings).toEqual([
      formatRowDate("2026-01-15", "en"),
      formatRowDate("2026-01-16", "en"),
      "Unknown date",
    ]);
    const descriptions = [...container.querySelectorAll("li p.truncate")].map(
      (el) => el.textContent,
    );
    expect(descriptions).toEqual(["Coffee", "Netflix", "Lunch", "Mystery"]);
  });

  it("uses a trash icon on per-row discard, not close, and disables selection for dedup rows", async () => {
    await renderSheet();
    const discard = container.querySelector(
      'button[aria-label="Discard"]',
    ) as HTMLButtonElement;
    expect(discard).toBeTruthy();
    expect(discard.querySelector("path")?.getAttribute("d")).toContain("M4 7h16");
    expect(discard.querySelector("path")?.getAttribute("d")).not.toContain("M6.5 6.5");

    const netflix = container.querySelector(
      'input[type="checkbox"][aria-label="Netflix"]',
    ) as HTMLInputElement;
    expect(netflix.disabled).toBe(true);
    const coffee = container.querySelector(
      'input[type="checkbox"][aria-label="Coffee"]',
    ) as HTMLInputElement;
    expect(coffee.disabled).toBe(false);
  });

  it("hides the selection bar until a row is checked, then pins Discard and Change List above the list with Save in the footer", async () => {
    await renderSheet();
    expect(container.querySelector('[data-fill-below-chrome="true"]')).toBeTruthy();
    expect(
      [...container.querySelectorAll("button")].find((b) => b.textContent === "Discard"),
    ).toBeUndefined();
    expect(
      [...container.querySelectorAll("button")].find((b) => b.textContent === "Change List"),
    ).toBeUndefined();
    expect(container.querySelector('[data-testid="sheet-footer"]')?.textContent).toContain(
      "Save",
    );

    const coffee = container.querySelector(
      'input[type="checkbox"][aria-label="Coffee"]',
    ) as HTMLInputElement;
    await act(async () => {
      coffee.click();
    });

    const discard = [...container.querySelectorAll("button")].find(
      (b) => b.textContent === "Discard",
    ) as HTMLButtonElement;
    const changeList = [...container.querySelectorAll("button")].find(
      (b) => b.textContent === "Change List",
    ) as HTMLButtonElement;
    expect(discard).toBeTruthy();
    expect(changeList).toBeTruthy();
    const pin = discard.parentElement?.parentElement;
    expect(pin?.className).toContain("sticky");
    expect(pin?.className).toContain("top-0");
    expect(pin?.className).toContain("bg-surface");
    expect(discard.parentElement?.contains(changeList)).toBe(true);
    expect(container.querySelector('[data-testid="sheet-footer"]')?.contains(discard)).toBe(
      false,
    );
  });

  it("stages a close-icon discard locally without calling unassignRow", async () => {
    await renderSheet();
    const coffeeLi = [...container.querySelectorAll("li")].find((el) =>
      el.textContent?.includes("Coffee"),
    ) as HTMLElement;
    await act(async () => {
      (coffeeLi.querySelector('button[aria-label="Discard"]') as HTMLButtonElement).click();
    });

    expect(unassignRow).not.toHaveBeenCalled();
    expect(finalizeSession).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Discarded");
    expect(container.querySelector("section.border-owe")).toBeTruthy();
    const remaining = [...container.querySelectorAll("li p.truncate")].map((el) => el.textContent);
    expect(remaining).toEqual(["Netflix", "Lunch", "Mystery", "Coffee"]);
    expect(
      [...container.querySelectorAll("button")].some((b) => b.textContent === "Restore"),
    ).toBe(true);
  });

  it("restores a staged row back to its original list group and day", async () => {
    await renderSheet();
    const coffeeLi = [...container.querySelectorAll("li")].find((el) =>
      el.textContent?.includes("Coffee"),
    ) as HTMLElement;
    await act(async () => {
      (coffeeLi.querySelector('button[aria-label="Discard"]') as HTMLButtonElement).click();
    });
    await act(async () => {
      [...container.querySelectorAll("button")]
        .find((b) => b.textContent === "Restore")
        ?.click();
    });

    expect(container.textContent).not.toContain("Discarded");
    expect(container.querySelector("section.border-owe")).toBeNull();
    const descriptions = [...container.querySelectorAll("li p.truncate")].map(
      (el) => el.textContent,
    );
    expect(descriptions).toEqual(["Coffee", "Netflix", "Lunch", "Mystery"]);
  });

  it("on Save deletes sheet-staged discarded assigned rows then finalizes; delete failure skips finalize", async () => {
    const onSessionUpdate = vi.fn();
    deleteRow.mockResolvedValueOnce({ ok: false, error: "cannot delete" });
    const remainingAssigned = session.statements[0].assigned_rows.filter(
      (row) => row.id !== "r-coffee",
    );
    const afterDelete = {
      ...session,
      statements: [{ ...session.statements[0], assigned_rows: remainingAssigned }],
    };
    finalizeSession.mockResolvedValue({
      ok: true,
      session: { ...afterDelete, finalized_at: "2026-08-24T00:00:00Z" },
    });

    await act(async () => {
      root.render(
        <ImportReviewSheet
          sessionId="s1"
          session={session}
          lists={lists}
          onSessionUpdate={onSessionUpdate}
          onClose={vi.fn()}
        />,
      );
    });
    await act(async () => {
      const coffeeLi = [...container.querySelectorAll("li")].find((el) =>
        el.textContent?.includes("Coffee"),
      ) as HTMLElement;
      (coffeeLi.querySelector('button[aria-label="Discard"]') as HTMLButtonElement).click();
    });
    expect(localStorage.getItem("finance-helper.staged-import-discards.s1")).toContain(
      "r-coffee",
    );
    await act(async () => {
      [...container.querySelectorAll("button")].find((b) => b.textContent === "Save")?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(deleteRow).toHaveBeenCalledWith("s1", "r-coffee", expect.anything());
    expect(finalizeSession).not.toHaveBeenCalled();
    expect(container.querySelector("[role='alert']")?.textContent).toBe("cannot delete");
    expect(localStorage.getItem("finance-helper.staged-import-discards.s1")).toContain(
      "r-coffee",
    );

    deleteRow.mockReset();
    deleteRow.mockResolvedValue({ ok: true, session: afterDelete });
    fetchImportSession.mockResolvedValue({ ok: true, session: afterDelete });

    await act(async () => {
      [...container.querySelectorAll("button")].find((b) => b.textContent === "Save")?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(unassignRow).not.toHaveBeenCalled();
    expect(deleteRow.mock.calls.map((call) => call[1])).toEqual(["r-coffee"]);
    expect(finalizeSession).toHaveBeenCalledTimes(1);
    expect(deleteRow.mock.invocationCallOrder[0]).toBeLessThan(
      finalizeSession.mock.invocationCallOrder[0],
    );
    expect(onSessionUpdate).toHaveBeenCalledTimes(3);
    expect(push).toHaveBeenCalledWith("/lists/list-home");
    expect(localStorage.getItem("finance-helper.staged-import-discards.s1")).toBeNull();
  });

  it("Discard stages checked rows without calling unassignRow until Save", async () => {
    await renderSheet();
    await act(async () => {
      (container.querySelector('input[aria-label="Coffee"]') as HTMLInputElement).click();
    });
    await act(async () => {
      (container.querySelector('input[aria-label="Lunch"]') as HTMLInputElement).click();
    });
    await act(async () => {
      [...container.querySelectorAll("button")]
        .find((b) => b.textContent === "Discard")
        ?.click();
    });

    expect(unassignRow).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Discarded");
    const remaining = [...container.querySelectorAll("li p.truncate")].map((el) => el.textContent);
    expect(remaining).toEqual(["Netflix", "Mystery", "Coffee", "Lunch"]);
    expect(
      [...container.querySelectorAll("button")].find((b) => b.textContent === "Change List"),
    ).toBeUndefined();
  });

  it("Save deletes card-staged pending and leaked sheet discards then finalizes remaining assigned rows", async () => {
    const onSessionUpdate = vi.fn();
    const keepers = session.statements[0].assigned_rows.filter((row) => row.id !== "r-coffee");
    const pendingTrash = makeRow({
      id: "r-trash",
      sequence: 9,
      description: "Uber",
      status: "pending",
      resolved_list_id: null,
    });
    const leakedCoffee = makeRow({
      id: "r-coffee",
      sequence: 2,
      description: "Coffee",
      status: "pending",
      resolved_list_id: null,
    });
    const leakedSession = {
      ...session,
      statements: [
        {
          ...session.statements[0],
          rows: [pendingTrash, leakedCoffee],
          assigned_rows: keepers,
        },
      ],
    };
    const afterDeletes = {
      ...leakedSession,
      statements: [{ ...leakedSession.statements[0], rows: [], assigned_rows: keepers }],
    };
    localStorage.setItem(
      "finance-helper.staged-import-discards.s1",
      JSON.stringify({
        deleteIds: ["r-trash"],
        sheetDiscardIds: ["r-coffee"],
        lastCardStagedId: "r-trash",
      }),
    );
    deleteRow
      .mockResolvedValueOnce({
        ok: true,
        session: {
          ...afterDeletes,
          statements: [{ ...afterDeletes.statements[0], rows: [leakedCoffee] }],
        },
      })
      .mockResolvedValueOnce({ ok: true, session: afterDeletes });
    fetchImportSession.mockResolvedValue({ ok: true, session: afterDeletes });
    finalizeSession.mockResolvedValue({
      ok: true,
      session: { ...afterDeletes, finalized_at: "2026-08-24T00:00:00Z" },
    });

    await act(async () => {
      root.render(
        <ImportReviewSheet
          sessionId="s1"
          session={leakedSession}
          lists={lists}
          onSessionUpdate={onSessionUpdate}
          onClose={vi.fn()}
        />,
      );
    });

    expect(container.textContent).toContain("Netflix");
    expect(container.textContent).toContain("Lunch");
    expect(container.textContent).toContain("Mystery");

    await act(async () => {
      [...container.querySelectorAll("button")].find((b) => b.textContent === "Save")?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(deleteRow.mock.calls.map((call) => call[1])).toEqual(["r-trash", "r-coffee"]);
    expect(finalizeSession).toHaveBeenCalledTimes(1);
    expect(deleteRow.mock.invocationCallOrder[1]).toBeLessThan(
      finalizeSession.mock.invocationCallOrder[0],
    );
    expect(push).toHaveBeenCalledWith("/lists/list-home");
    expect(container.querySelector("[role='alert']")).toBeNull();
    expect(localStorage.getItem("finance-helper.staged-import-discards.s1")).toBeNull();
  });

  it("Change List unassigns only the selected rows; failure skips later rows and stays on the sheet", async () => {
    const onSessionUpdate = vi.fn();
    unassignRow.mockResolvedValueOnce({ ok: false, error: "cannot unassign" });

    await act(async () => {
      root.render(
        <ImportReviewSheet
          sessionId="s1"
          session={session}
          lists={lists}
          onSessionUpdate={onSessionUpdate}
          onClose={vi.fn()}
        />,
      );
    });
    await act(async () => {
      (container.querySelector('input[aria-label="Coffee"]') as HTMLInputElement).click();
      (container.querySelector('input[aria-label="Lunch"]') as HTMLInputElement).click();
    });
    await act(async () => {
      [...container.querySelectorAll("button")]
        .find((b) => b.textContent === "Change List")
        ?.click();
    });

    expect(unassignRow).toHaveBeenCalledTimes(1);
    expect(unassignRow).toHaveBeenCalledWith("s1", "r-coffee", expect.anything());
    expect(finalizeSession).not.toHaveBeenCalled();
    expect(onSessionUpdate).not.toHaveBeenCalled();
    expect(container.querySelector("[role='alert']")?.textContent).toBe("cannot unassign");
    expect(container.textContent).toContain("Confirm placements");

    unassignRow.mockReset();
    const afterCoffee = {
      ...session,
      statements: [
        {
          ...session.statements[0],
          rows: [makeRow({ id: "r-coffee", description: "Coffee", status: "pending", resolved_list_id: null })],
          assigned_rows: session.statements[0].assigned_rows.filter((row) => row.id !== "r-coffee"),
        },
      ],
    };
    unassignRow
      .mockResolvedValueOnce({ ok: true, session: afterCoffee })
      .mockResolvedValueOnce({ ok: true, session: { ...afterCoffee, statements: [{ ...afterCoffee.statements[0], rows: [
        makeRow({ id: "r-coffee", description: "Coffee", status: "pending", resolved_list_id: null }),
        makeRow({ id: "r-lunch", description: "Lunch", status: "pending", resolved_list_id: null }),
      ], assigned_rows: afterCoffee.statements[0].assigned_rows.filter((row) => row.id !== "r-lunch") }] } });

    await act(async () => {
      [...container.querySelectorAll("button")]
        .find((b) => b.textContent === "Change List")
        ?.click();
    });

    expect(unassignRow.mock.calls.map((call) => call[1])).toEqual(["r-coffee", "r-lunch"]);
    expect(onSessionUpdate).toHaveBeenCalled();
  });
});
