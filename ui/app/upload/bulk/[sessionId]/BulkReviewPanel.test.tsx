/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppShell } from "@/components/AppShell";
import { BulkReviewPanel } from "./BulkReviewPanel";
import { resetMembershipListsStore } from "@/app/lists/membershipListsStore";
import type { ImportSession } from "../../uploadClient";

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
const assignRow = vi.fn();
const deleteRow = vi.fn();
const finalizeSession = vi.fn();
vi.mock("../../uploadClient", async () => {
  const actual = await vi.importActual<typeof import("../../uploadClient")>("../../uploadClient");
  return {
    ...actual,
    bulkCommitSession: (...args: unknown[]) => bulkCommitSession(...args),
    fetchImportSession: (...args: unknown[]) => fetchImportSession(...args),
    assignRow: (...args: unknown[]) => assignRow(...args),
    deleteRow: (...args: unknown[]) => deleteRow(...args),
    finalizeSession: (...args: unknown[]) => finalizeSession(...args),
  };
});

vi.mock("next/dynamic", () => ({
  default: () =>
    function ParseComparisonStub(props: {
      statement: { id: string };
      onContinue: () => void;
      onDismissStatement: (session: ImportSession) => void;
      onDismissFile: () => void;
    }) {
      return (
        <div data-testid="parse-comparison">
          <span>{props.statement.id}</span>
          <button type="button" onClick={props.onContinue}>
            Continue
          </button>
          <button
            type="button"
            onClick={() =>
              props.onDismissStatement({
                id: "s1",
                created_at: "2026-08-18T00:00:00Z",
                discarded_at: null,
                statements: [
                  {
                    id: props.statement.id,
                    product_id: "p",
                    status: "skipped",
                    candidate_row_count: 0,
                    iban: null,
                    filename: "a.pdf",
                    card_id: null,
                    rows: [],
                    assigned_rows: [],
                    zero_amount_excluded_count: 0,
                  },
                ],
                undo: null,
                finalized_at: null,
                imported_new_count: 0,
                skipped_duplicate_count: 0,
                landing_list_id: null,
                deleted_count: 0,
                zero_amount_excluded_count: 0,
                failed_statements: [],
                committed_by_list: [],
              })
            }
          >
            Dismiss statement
          </button>
          <button type="button" onClick={props.onDismissFile}>
            Dismiss file
          </button>
        </div>
      );
    },
}));

vi.mock("@/components/PreferencesProvider", () => ({
  usePreferences: () => ({ locale: "en", theme: "light" }),
}));

function selectByText(container: HTMLElement, text: string): HTMLButtonElement {
  return Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent === text,
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

describe("BulkReviewPanel", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    fetchLists.mockReset();
    bulkCommitSession.mockReset();
    fetchImportSession.mockReset();
    assignRow.mockReset();
    deleteRow.mockReset();
    finalizeSession.mockReset();
    routeAfterImportLanding.mockReset();
    routeAfterImportLanding.mockImplementation(
      async (router: { push: (href: string) => void }, listId: string | null) => {
        router.push(listId ? `/lists/${listId}` : "/lists");
      },
    );
    fetchImportSession.mockResolvedValue({
      ok: true,
      session: {
        id: "s1",
        created_at: "2026-01-01T00:00:00Z",
        discarded_at: null,
        undo: null,
        statements: [
          {
            id: "st1",
            product_id: "bac_credit",
            status: "staged",
            candidate_row_count: 1,
            iban: null,
            filename: "a.pdf",
            card_id: null,
            rows: [
              {
                id: "r1",
                sequence: 0,
                description: "Coffee shop",
                amount: "4.50",
                currency: "USD",
                posted_date: "2026-01-02",
                status: "pending",
              },
            ],
            assigned_rows: [],
            zero_amount_excluded_count: 0,
          },
        ],
        finalized_at: null,
        imported_new_count: 0,
        skipped_duplicate_count: 0,
        landing_list_id: null,
        deleted_count: 0,
        zero_amount_excluded_count: 0,
        failed_statements: [],
        committed_by_list: [],
      },
    });
    push.mockReset();
    searchParamsValue = "";
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

  it("confirm is disabled until a list is chosen, then commits and navigates on success", async () => {
    fetchLists.mockResolvedValue({
      ok: true,
      lists: [
        { id: "l1", name: "Groceries", owner_id: "u1", role: "owner" },
        { id: "l2", name: "Trip", owner_id: "u1", role: "member" },
      ],
    });
    bulkCommitSession.mockResolvedValue({
      ok: true,
      result: { session_id: "s1", list_id: "l1", batches: [] },
    });

    await act(async () => {
      root.render(<BulkReviewPanel sessionId="s1" />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    const confirmButton = selectByText(container, "Commit to this list");
    expect(confirmButton.disabled).toBe(true);

    await openAndChoose(container, "Groceries");
    expect(confirmButton.disabled).toBe(false);

    await act(async () => {
      confirmButton.click();
    });

    expect(bulkCommitSession).toHaveBeenCalledWith("s1", "l1", expect.anything());
    expect(push).toHaveBeenCalledWith("/lists/l1");
  });

  it("pre-selects the list from the ?listId= query param when it is a valid membership", async () => {
    searchParamsValue = "listId=l2";
    fetchLists.mockResolvedValue({
      ok: true,
      lists: [
        { id: "l1", name: "Groceries", owner_id: "u1", role: "owner" },
        { id: "l2", name: "Trip", owner_id: "u1", role: "member" },
      ],
    });

    await act(async () => {
      root.render(<BulkReviewPanel sessionId="s1" />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    const confirmButton = selectByText(container, "Commit to this list");
    expect(confirmButton.disabled).toBe(false);
  });

  it("shows a 403 error inline without navigating", async () => {
    fetchLists.mockResolvedValue({
      ok: true,
      lists: [{ id: "l1", name: "Groceries", owner_id: "u1", role: "owner" }],
    });
    bulkCommitSession.mockResolvedValue({
      ok: false,
      error: "You don't have access to that list.",
    });

    await act(async () => {
      root.render(<BulkReviewPanel sessionId="s1" />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    await openAndChoose(container, "Groceries");
    const confirmButton = selectByText(container, "Commit to this list");
    await act(async () => {
      confirmButton.click();
    });

    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toBe("You don't have access to that list.");
    expect(push).not.toHaveBeenCalled();
  });

  it("shows comparison before the list picker when a statement failed to parse", async () => {
    fetchImportSession.mockResolvedValue({
      ok: true,
      session: {
        id: "s1",
        created_at: "2026-01-01T00:00:00Z",
        discarded_at: null,
        undo: null,
        statements: [
          {
            id: "st-failed",
            product_id: "promerica_stub",
            status: "failed",
            candidate_row_count: 0,
            iban: null,
            filename: "a.pdf",
            card_id: null,
            rows: [],
            assigned_rows: [],
            zero_amount_excluded_count: 0,
            parse_evidence: { items: [{ kind: "gap", raw_snippet: "bad" }] },
          },
        ],
        finalized_at: null,
        imported_new_count: 0,
        skipped_duplicate_count: 0,
        landing_list_id: null,
        deleted_count: 0,
        zero_amount_excluded_count: 0,
        failed_statements: [],
        committed_by_list: [],
      },
    });
    fetchLists.mockResolvedValue({
      ok: true,
      lists: [{ id: "l1", name: "Groceries", owner_id: "u1", role: "owner" }],
    });

    await act(async () => {
      root.render(<BulkReviewPanel sessionId="s1" />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="parse-comparison"]')?.textContent).toContain(
      "st-failed",
    );
    expect(selectByText(container, "Commit to this list")).toBeUndefined();
  });

  it("after dismissing a failed statement with no pending rows, shows the list picker", async () => {
    fetchImportSession.mockResolvedValue({
      ok: true,
      session: {
        id: "s1",
        created_at: "2026-01-01T00:00:00Z",
        discarded_at: null,
        undo: null,
        statements: [
          {
            id: "st-failed",
            product_id: "promerica_stub",
            status: "failed",
            candidate_row_count: 0,
            iban: null,
            filename: "a.pdf",
            card_id: null,
            rows: [],
            assigned_rows: [],
            zero_amount_excluded_count: 0,
          },
        ],
        finalized_at: null,
        imported_new_count: 0,
        skipped_duplicate_count: 0,
        landing_list_id: null,
        deleted_count: 0,
        zero_amount_excluded_count: 0,
        failed_statements: [],
        committed_by_list: [],
      },
    });
    fetchLists.mockResolvedValue({
      ok: true,
      lists: [{ id: "l1", name: "Groceries", owner_id: "u1", role: "owner" }],
    });

    await act(async () => {
      root.render(<BulkReviewPanel sessionId="s1" />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    const dismiss = selectByText(container, "Dismiss statement");
    await act(async () => {
      dismiss.click();
    });

    expect(container.querySelector('[data-testid="parse-comparison"]')).toBeNull();
    expect(selectByText(container, "Commit to this list")).toBeDefined();
  });

  it("dismiss file from comparison navigates to upload home", async () => {
    fetchImportSession.mockResolvedValue({
      ok: true,
      session: {
        id: "s1",
        created_at: "2026-01-01T00:00:00Z",
        discarded_at: null,
        undo: null,
        statements: [
          {
            id: "st-failed",
            product_id: "promerica_stub",
            status: "failed",
            candidate_row_count: 0,
            iban: null,
            filename: "a.pdf",
            card_id: null,
            rows: [],
            assigned_rows: [],
            zero_amount_excluded_count: 0,
          },
        ],
        finalized_at: null,
        imported_new_count: 0,
        skipped_duplicate_count: 0,
        landing_list_id: null,
        deleted_count: 0,
        zero_amount_excluded_count: 0,
        failed_statements: [],
        committed_by_list: [],
      },
    });
    fetchLists.mockResolvedValue({ ok: true, lists: [] });

    await act(async () => {
      root.render(<BulkReviewPanel sessionId="s1" />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      selectByText(container, "Dismiss file").click();
    });
    expect(push).toHaveBeenCalledWith("/upload");
  });

  it("does not show the list picker when the session fetch fails", async () => {
    fetchImportSession.mockResolvedValue({
      ok: false,
      error: "This import session could not be found.",
    });
    fetchLists.mockResolvedValue({
      ok: true,
      lists: [{ id: "l1", name: "Groceries", owner_id: "u1", role: "owner" }],
    });

    await act(async () => {
      root.render(<BulkReviewPanel sessionId="s1" />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "This import session could not be found.",
    );
    expect(selectByText(container, "Commit to this list")).toBeUndefined();
  });

  const emptiedSession = {
    id: "s1",
    created_at: "2026-01-01T00:00:00Z",
    discarded_at: null,
    undo: null,
    statements: [
      {
        id: "st1",
        product_id: "bac_credit",
        status: "staged",
        candidate_row_count: 1,
        iban: null,
        filename: "a.pdf",
        card_id: null,
        rows: [],
        assigned_rows: [],
        zero_amount_excluded_count: 0,
      },
    ],
    finalized_at: null,
    imported_new_count: 0,
    skipped_duplicate_count: 0,
    landing_list_id: null,
    deleted_count: 0,
    zero_amount_excluded_count: 0,
    failed_statements: [],
    committed_by_list: [],
  };

  it("deleting a pending row calls deleteRow and drops it from the exception list", async () => {
    fetchLists.mockResolvedValue({
      ok: true,
      lists: [{ id: "l1", name: "Groceries", owner_id: "u1", role: "owner" }],
    });
    deleteRow.mockResolvedValue({ ok: true, session: emptiedSession });

    await act(async () => {
      root.render(<BulkReviewPanel sessionId="s1" />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    await openAndChoose(container, "Groceries");
    expect(container.textContent).toContain("Coffee shop");

    const deleteButton = container.querySelector(
      'button[aria-label="Delete"]',
    ) as HTMLButtonElement;
    await act(async () => {
      deleteButton.click();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(deleteRow).toHaveBeenCalledWith("s1", "r1", expect.anything());
    expect(container.textContent).not.toContain("Coffee shop");
  });

  it("moving a pending row calls assignRow with the picked target list", async () => {
    fetchLists.mockResolvedValue({
      ok: true,
      lists: [
        { id: "l1", name: "Groceries", owner_id: "u1", role: "owner" },
        { id: "l2", name: "Trip", owner_id: "u1", role: "member" },
      ],
    });
    assignRow.mockResolvedValue({ ok: true, session: emptiedSession });

    await act(async () => {
      root.render(<BulkReviewPanel sessionId="s1" />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    await openAndChoose(container, "Groceries");

    const triggers = Array.from(
      container.querySelectorAll('button[aria-haspopup="listbox"]'),
    ) as HTMLButtonElement[];
    // [0] is the main list picker (now showing "Groceries"); [1] is this
    // row's "Move to…" picker.
    await act(async () => {
      triggers[1].click();
    });
    const option = Array.from(container.querySelectorAll('[role="option"]')).find(
      (el) => el.textContent === "Trip",
    ) as HTMLElement;
    await act(async () => {
      option.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });

    expect(assignRow).toHaveBeenCalledWith("s1", "r1", "l2", expect.anything());
  });

  it("finalizes instead of bulk-committing once every row was resolved individually", async () => {
    fetchLists.mockResolvedValue({
      ok: true,
      lists: [{ id: "l1", name: "Groceries", owner_id: "u1", role: "owner" }],
    });
    deleteRow.mockResolvedValue({ ok: true, session: emptiedSession });
    finalizeSession.mockResolvedValue({ ok: true, session: emptiedSession });

    await act(async () => {
      root.render(<BulkReviewPanel sessionId="s1" />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    await openAndChoose(container, "Groceries");
    const deleteButton = container.querySelector(
      'button[aria-label="Delete"]',
    ) as HTMLButtonElement;
    await act(async () => {
      deleteButton.click();
    });
    await act(async () => {
      await Promise.resolve();
    });

    const confirmButton = selectByText(container, "Commit to this list");
    await act(async () => {
      confirmButton.click();
    });

    expect(finalizeSession).toHaveBeenCalledWith("s1", expect.anything());
    expect(bulkCommitSession).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/lists/l1");
  });

  it("routes to conflict review instead of the list when the queue is non-empty (Story 5.5, UX-DR22)", async () => {
    fetchLists.mockResolvedValue({
      ok: true,
      lists: [{ id: "l1", name: "Groceries", owner_id: "u1", role: "owner" }],
    });
    bulkCommitSession.mockResolvedValue({
      ok: true,
      result: { session_id: "s1", list_id: "l1", batches: [] },
    });
    routeAfterImportLanding.mockImplementation(
      async (router: { push: (href: string) => void }, listId: string | null) => {
        router.push(`/upload/conflicts?landingListId=${listId}`);
      },
    );

    await act(async () => {
      root.render(<BulkReviewPanel sessionId="s1" />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    await openAndChoose(container, "Groceries");
    const confirmButton = selectByText(container, "Commit to this list");
    await act(async () => {
      confirmButton.click();
    });

    expect(bulkCommitSession).toHaveBeenCalledWith("s1", "l1", expect.anything());
    expect(push).toHaveBeenCalledWith("/upload/conflicts?landingListId=l1");
  });

  it("renders a help icon that navigates to /docs#cards-imports", async () => {
    fetchLists.mockResolvedValue({ ok: true, lists: [] });

    await act(async () => {
      root.render(
        <AppShell>
          <BulkReviewPanel sessionId="s1" />
        </AppShell>,
      );
    });
    await act(async () => {
      await Promise.resolve();
    });

    const helpButton = container.querySelector(
      'button[aria-label="Learn more about Upload"]',
    ) as HTMLButtonElement;
    expect(helpButton).toBeTruthy();

    await act(async () => {
      helpButton.click();
    });
    expect(push).toHaveBeenCalledWith("/docs?from=%2Fupload%2Fbulk%2Fs1#cards-imports");
  });
});
