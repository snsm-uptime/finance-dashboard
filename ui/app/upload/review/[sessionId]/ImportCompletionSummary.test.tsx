/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ImportCompletionSummary } from "./ImportCompletionSummary";
import type { ImportSession } from "../../uploadClient";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("@/components/PreferencesProvider", () => ({
  usePreferences: () => ({ locale: "en" as const }),
}));

const finalized: ImportSession = {
  id: "s1",
  created_at: "2026-08-24T00:00:00Z",
  discarded_at: null,
  undo: null,
  finalized_at: "2026-08-24T01:00:00Z",
  imported_new_count: 3,
  skipped_duplicate_count: 1,
  landing_list_id: "list-1",
  deleted_count: 2,
  zero_amount_excluded_count: 4,
  failed_statements: [{ id: "f1", product_id: "bac_credit", filename: "bad.pdf" }],
  committed_by_list: [{ list_id: "list-1", name: "Groceries", count: 3 }],
  statements: [],
};

describe("ImportCompletionSummary", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    push.mockReset();
  });

  afterEach(() => {
    root.unmount();
    container.remove();
  });

  it("renders counts and Continue lands on the landing list", async () => {
    await act(async () => {
      root.render(<ImportCompletionSummary session={finalized} />);
    });

    expect(container.textContent).toContain("3 added to Groceries");
    expect(container.textContent).toContain("2 deleted");
    expect(container.textContent).toContain("4 zero-amount");
    expect(container.textContent).toContain("bad.pdf");
    expect(container.textContent).toContain("3 imported");
    expect(container.textContent).toContain("1 skipped as duplicates");

    const continueButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Continue",
    );
    await act(async () => {
      continueButton?.click();
    });
    expect(push).toHaveBeenCalledWith("/lists/list-1");
  });
});
