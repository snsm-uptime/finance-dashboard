/** @vitest-environment jsdom */

import { act } from "react";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BulkAssignSheet } from "./BulkAssignSheet";
import { resetMembershipListsStore } from "@/app/lists/membershipListsStore";
import { resetUploadQueue } from "../../uploadQueueStore";
import type { ImportSession, StagedStatement, CandidateRow } from "../../uploadClient";

const push = vi.fn();
let searchParamsValue = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/upload/bulk/s1",
  useSearchParams: () => new URLSearchParams(searchParamsValue),
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

const routeAfterImportLanding = vi.fn();
vi.mock("../../conflictsClient", async () => {
  const actual =
    await vi.importActual<typeof import("../../conflictsClient")>("../../conflictsClient");
  return {
    ...actual,
    routeAfterImportLanding: (...args: unknown[]) => routeAfterImportLanding(...args),
  };
});

const bulkCommitSession = vi.fn();
const fetchImportSession = vi.fn();
const deleteRow = vi.fn();
const finalizeSession = vi.fn();
vi.mock("../../uploadClient", async () => {
  const actual = await vi.importActual<typeof import("../../uploadClient")>("../../uploadClient");
  return {
    ...actual,
    bulkCommitSession: (...args: unknown[]) => bulkCommitSession(...args),
    fetchImportSession: (...args: unknown[]) => fetchImportSession(...args),
    deleteRow: (...args: unknown[]) => deleteRow(...args),
    finalizeSession: (...args: unknown[]) => finalizeSession(...args),
  };
});

vi.mock("next/dynamic", () => ({
  default: () =>
    function ParseComparisonStub() {
      return <div data-testid="parse-comparison" />;
    },
}));

vi.mock("@/components/PreferencesProvider", () => ({
  usePreferences: () => ({ locale: "en" as const, theme: "light" as const }),
}));

vi.mock("@/components/IconButton/IconButton.module.scss", () => ({
  default: new Proxy({}, { get: (_t, prop) => String(prop) }),
}));

vi.mock("@/app/lists/Sheet", () => ({
  Sheet: ({
    title,
    body,
    footer,
    closeLabel,
    onClose,
  }: {
    title: string;
    body: ReactNode;
    footer?: ReactNode;
    closeLabel: string;
    onClose: () => void;
  }) => (
    <div role="dialog" aria-label={title}>
      <h2>{title}</h2>
      <button type="button" aria-label={closeLabel} onClick={onClose}>
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
    status: "pending",
    ...overrides,
  };
}

function makeStatement(overrides: Partial<StagedStatement> = {}): StagedStatement {
  return {
    id: "st1",
    product_id: "bac_credit",
    status: "staged",
    candidate_row_count: 1,
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
    landing_list_id: null,
    ...overrides,
    deleted_count: overrides.deleted_count ?? 0,
    zero_amount_excluded_count: overrides.zero_amount_excluded_count ?? 0,
    failed_statements: overrides.failed_statements ?? [],
    committed_by_list: overrides.committed_by_list ?? [],
  };
}

const lists = [
  { id: "l1", name: "Groceries", owner_id: "u1", role: "owner" },
  { id: "l2", name: "Trip", owner_id: "u1", role: "member" },
];

function findButtonByText(container: HTMLElement, text: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent === text,
  ) as HTMLButtonElement | undefined;
}

/** The list chip picker: click the trigger chip, then a labeled option in its slide-down panel. */
async function chooseListViaChip(container: HTMLElement, label: string) {
  const trigger = container.querySelector(
    'button[aria-label="Target list"]',
  ) as HTMLButtonElement;
  await act(async () => {
    trigger.click();
  });
  const option = Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent === label,
  ) as HTMLButtonElement;
  await act(async () => {
    option.click();
  });
}

describe("BulkAssignSheet", () => {
  let container: HTMLDivElement;
  let root: Root;
  let session: ImportSession;

  beforeEach(() => {
    localStorage.clear();
    fetchLists.mockReset();
    bulkCommitSession.mockReset();
    fetchImportSession.mockReset();
    deleteRow.mockReset();
    finalizeSession.mockReset();
    routeAfterImportLanding.mockReset();
    push.mockReset();
    searchParamsValue = "";
    resetUploadQueue();
    fetchLists.mockResolvedValue({ ok: true, lists });
    session = makeSession({
      statements: [
        makeStatement({
          rows: [
            makeRow({ id: "r-coffee", sequence: 1, description: "Coffee", posted_date: "2026-01-15" }),
            makeRow({ id: "r-lunch", sequence: 2, description: "Lunch", posted_date: "2026-01-16" }),
          ],
        }),
      ],
    });
    fetchImportSession.mockResolvedValue({ ok: true, session });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    resetMembershipListsStore();
  });

  async function renderSheet() {
    await act(async () => {
      root.render(<BulkAssignSheet sessionId="s1" />);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  it("Save is disabled until a list is chosen via the chip picker, then bulk-commits", async () => {
    bulkCommitSession.mockResolvedValue({
      ok: true,
      result: { session_id: "s1", list_id: "l1", batches: [] },
    });

    await renderSheet();

    const saveButton = findButtonByText(container, "Commit to this list") as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);

    await chooseListViaChip(container, "Groceries");
    expect(saveButton.disabled).toBe(false);

    await act(async () => {
      saveButton.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(bulkCommitSession).toHaveBeenCalledWith("s1", "l1", expect.anything());
    expect(routeAfterImportLanding).toHaveBeenCalledWith(expect.anything(), "l1");
  });

  it("stages a discard locally, then restoring it returns the row to the list", async () => {
    await renderSheet();
    await chooseListViaChip(container, "Groceries");

    await act(async () => {
      const coffeeLi = [...container.querySelectorAll("li")].find((el) =>
        el.textContent?.includes("Coffee"),
      ) as HTMLElement;
      (coffeeLi.querySelector('button[aria-label="Delete"]') as HTMLButtonElement).click();
    });

    expect(localStorage.getItem("finance-helper.staged-import-discards.s1")).toContain("r-coffee");
    expect(
      [...container.querySelectorAll("li")].some((el) =>
        el.textContent?.includes("Coffee") ? el.querySelector('button[aria-label="Delete"]') : false,
      ),
    ).toBe(false);
    expect(deleteRow).not.toHaveBeenCalled();

    await act(async () => {
      findButtonByText(container, "Restore")?.click();
    });

    expect(localStorage.getItem("finance-helper.staged-import-discards.s1")).toBeNull();
    expect(
      [...container.querySelectorAll("li")].some(
        (el) => el.textContent?.includes("Coffee") && el.querySelector('button[aria-label="Delete"]'),
      ),
    ).toBe(true);
  });

  it("Save deletes staged discards then bulk-commits the remaining rows", async () => {
    const afterDelete = {
      ...session,
      statements: [
        { ...session.statements[0], rows: session.statements[0].rows.filter((r) => r.id !== "r-coffee") },
      ],
    };
    deleteRow.mockResolvedValue({ ok: true, session: afterDelete });
    bulkCommitSession.mockResolvedValue({
      ok: true,
      result: { session_id: "s1", list_id: "l1", batches: [] },
    });

    await renderSheet();
    await chooseListViaChip(container, "Groceries");
    await act(async () => {
      const coffeeLi = [...container.querySelectorAll("li")].find((el) =>
        el.textContent?.includes("Coffee"),
      ) as HTMLElement;
      (coffeeLi.querySelector('button[aria-label="Delete"]') as HTMLButtonElement).click();
    });

    await act(async () => {
      findButtonByText(container, "Commit to this list")?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(deleteRow).toHaveBeenCalledWith("s1", "r-coffee", expect.anything());
    expect(bulkCommitSession).toHaveBeenCalledWith("s1", "l1", expect.anything());
    expect(localStorage.getItem("finance-helper.staged-import-discards.s1")).toBeNull();
  });

  it("finalizes directly (no bulkCommitSession) once every row was discard-staged, not moved", async () => {
    const afterDeleteCoffee = {
      ...session,
      statements: [
        { ...session.statements[0], rows: session.statements[0].rows.filter((r) => r.id !== "r-coffee") },
      ],
    };
    const afterDeleteLunch = {
      ...session,
      statements: [{ ...session.statements[0], rows: [] }],
    };
    deleteRow.mockResolvedValueOnce({ ok: true, session: afterDeleteCoffee });
    deleteRow.mockResolvedValueOnce({ ok: true, session: afterDeleteLunch });
    finalizeSession.mockResolvedValue({
      ok: true,
      session: { ...afterDeleteLunch, finalized_at: "2026-08-24T00:00:00Z" },
    });

    await renderSheet();
    await chooseListViaChip(container, "Groceries");

    for (const description of ["Coffee", "Lunch"]) {
      await act(async () => {
        const li = [...container.querySelectorAll("li")].find((el) =>
          el.textContent?.includes(description),
        ) as HTMLElement;
        (li.querySelector('button[aria-label="Delete"]') as HTMLButtonElement).click();
      });
    }

    await act(async () => {
      findButtonByText(container, "Commit to this list")?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(deleteRow).toHaveBeenCalledTimes(2);
    expect(bulkCommitSession).not.toHaveBeenCalled();
    expect(finalizeSession).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("finance-helper.staged-import-discards.s1")).toBeNull();
  });

  it("closing the sheet routes to /upload", async () => {
    await renderSheet();
    await act(async () => {
      (container.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click();
    });
    expect(push).toHaveBeenCalledWith("/upload");
  });

  it("pre-selects the list from the ?listId= query param when it is a valid membership", async () => {
    searchParamsValue = "listId=l2";

    await renderSheet();

    const saveButton = findButtonByText(container, "Commit to this list") as HTMLButtonElement;
    expect(saveButton.disabled).toBe(false);
  });
});
