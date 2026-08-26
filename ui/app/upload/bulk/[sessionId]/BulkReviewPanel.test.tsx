/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BulkReviewPanel } from "./BulkReviewPanel";
import { resetMembershipListsStore } from "@/app/lists/membershipListsStore";

const push = vi.fn();
let searchParamsValue = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
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

const bulkCommitSession = vi.fn();
const fetchImportSession = vi.fn();
vi.mock("../../uploadClient", async () => {
  const actual = await vi.importActual<typeof import("../../uploadClient")>("../../uploadClient");
  return {
    ...actual,
    bulkCommitSession: (...args: unknown[]) => bulkCommitSession(...args),
    fetchImportSession: (...args: unknown[]) => fetchImportSession(...args),
  };
});

vi.mock("next/dynamic", () => ({
  default: () =>
    function ParseComparisonStub(props: {
      statement: { id: string };
      onContinue: () => void;
    }) {
      return (
        <div data-testid="parse-comparison">
          <span>{props.statement.id}</span>
          <button type="button" onClick={props.onContinue}>
            Continue
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
});
