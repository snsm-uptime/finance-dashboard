/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ImportCompletionSummary } from "./ImportCompletionSummary";
import type { ImportSession } from "../../uploadClient";

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
  });

  afterEach(() => {
    root.unmount();
    container.remove();
  });

  it("renders counts without a Continue button", async () => {
    await act(async () => {
      root.render(<ImportCompletionSummary session={finalized} />);
    });

    const rows = [...container.querySelectorAll("li")];
    const byLabel = (fragment: string) =>
      rows.find((row) => row.textContent?.includes(fragment));

    const groceries = byLabel("Added to Groceries");
    expect(groceries).toBeTruthy();
    expect(groceries?.textContent).toMatch(/3/);

    const deleted = byLabel("Deleted");
    expect(deleted?.textContent).toMatch(/2/);

    const zero = byLabel("Zero-amount excluded");
    expect(zero?.textContent).toMatch(/4/);
    expect(zero?.textContent).toContain("Check the PDF");

    const failed = byLabel("Could not parse bad.pdf");
    expect(failed).toBeTruthy();
    expect(failed?.textContent).toContain("—");

    const imported = byLabel("Imported");
    expect(imported?.textContent).toMatch(/3/);

    const skipped = byLabel("Skipped as duplicates");
    expect(skipped?.textContent).toMatch(/1/);

    expect(container.textContent).not.toContain("Continue");
    expect(container.querySelector("button")).toBeNull();

    const slip = container.querySelector(".bg-surface");
    expect(slip?.className).toContain("bg-surface");
    expect(slip?.className).toContain("dark:text-white");
    expect(slip?.getAttribute("style") ?? "").toMatch(/clip-path|clipPath/);
  });
});
