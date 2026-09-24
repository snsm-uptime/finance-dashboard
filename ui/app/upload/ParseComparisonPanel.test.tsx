/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ParseComparisonPanel } from "./ParseComparisonPanel";
import type { ImportSession, StagedStatement } from "./uploadClient";
import { uploadMessages } from "@/lib/i18n/upload";

vi.mock("react-pdf", () => ({
  pdfjs: { GlobalWorkerOptions: { workerSrc: "" } },
  Document: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="pdf-document">{children}</div>
  ),
  Page: () => <div />,
}));

const dismissFailedStatement = vi.fn();
const discardSession = vi.fn();
vi.mock("./uploadClient", async () => {
  const actual = await vi.importActual<typeof import("./uploadClient")>("./uploadClient");
  return {
    ...actual,
    dismissFailedStatement: (...args: unknown[]) => dismissFailedStatement(...args),
    discardSession: (...args: unknown[]) => discardSession(...args),
  };
});

const fetchLists = vi.fn();
const fetchListMembers = vi.fn();
const createExpense = vi.fn();
// Two specifiers resolve to the same file (ManualEntryColumn imports via the
// "@/" alias, ManualExpenseForm.tsx imports it relatively) — mock both so
// neither import path slips through to the real network call.
vi.mock("@/app/lists/listsClient", async () => {
  const actual = await vi.importActual<typeof import("@/app/lists/listsClient")>(
    "@/app/lists/listsClient",
  );
  return {
    ...actual,
    fetchLists: (...args: unknown[]) => fetchLists(...args),
    fetchListMembers: (...args: unknown[]) => fetchListMembers(...args),
    createExpense: (...args: unknown[]) => createExpense(...args),
  };
});
vi.mock("../lists/listsClient", async () => {
  const actual = await vi.importActual<typeof import("@/app/lists/listsClient")>(
    "@/app/lists/listsClient",
  );
  return {
    ...actual,
    fetchLists: (...args: unknown[]) => fetchLists(...args),
    fetchListMembers: (...args: unknown[]) => fetchListMembers(...args),
    createExpense: (...args: unknown[]) => createExpense(...args),
  };
});

const routerRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: routerRefresh }),
}));

vi.mock("@/components/soft-ledger/Select", () => ({
  SoftLedgerSelect: ({
    id,
    name,
    value,
    options,
    onChange,
    disabled,
    "aria-label": ariaLabel,
    "aria-labelledby": labelledBy,
  }: {
    id?: string;
    name?: string;
    value: string;
    options: { value: string; label: string }[];
    onChange: (value: string) => void;
    disabled?: boolean;
    "aria-label"?: string;
    "aria-labelledby"?: string;
  }) => (
    <select
      id={id}
      name={name}
      value={value}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-labelledby={labelledBy}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  ),
}));

vi.mock("@/components/PreferencesProvider", async () => {
  const actual = await vi.importActual<typeof import("@/components/PreferencesProvider")>(
    "@/components/PreferencesProvider",
  );
  return {
    ...actual,
    useOptionalPreferences: () => ({ me: { user_id: "user-a" } }),
  };
});

const statement: StagedStatement = {
  id: "st-failed",
  product_id: "promerica_stub",
  status: "failed",
  candidate_row_count: 0,
  iban: null,
  filename: "promerica_estado.pdf",
  card_id: null,
  rows: [],
  assigned_rows: [],
  zero_amount_excluded_count: 0,
  parse_evidence: {
    items: [
      {
        kind: "row",
        description: "COMERCIO GENERICO UNO",
        amount: "1000.00",
        currency: "CRC",
        posted_date: "2026-01-05",
      },
      { kind: "gap", raw_snippet: "07-ENE-26|COMERCIO GENERICO MALO|not-an-amount" },
    ],
  },
};

describe("ParseComparisonPanel", () => {
  let container: HTMLDivElement;
  let root: Root;

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    dismissFailedStatement.mockReset();
    discardSession.mockReset();
    fetchLists.mockReset();
    fetchListMembers.mockReset();
    createExpense.mockReset();
  });

  async function renderPanel(
    onContinue: () => void = () => undefined,
    fixture: StagedStatement = statement,
    handlers: {
      onDismissStatement?: (session: ImportSession) => void;
      onDismissFile?: () => void;
    } = {},
  ) {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(["%PDF"], { type: "application/pdf" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(
        <ParseComparisonPanel
          sessionId="s1"
          statement={fixture}
          locale="en"
          onContinue={onContinue}
          onDismissStatement={handlers.onDismissStatement ?? (() => undefined)}
          onDismissFile={handlers.onDismissFile ?? (() => undefined)}
        />,
      );
    });
    await act(async () => {
      await Promise.resolve();
    });
    return fetchMock;
  }

  it("labels extracted-items and PDF regions and loads the BFF PDF", async () => {
    const fetchMock = await renderPanel();
    expect(
      container.querySelector('[aria-label="Extracted items"]')?.getAttribute("role"),
    ).toBe("region");
    expect(
      container.querySelector('[aria-label="Original statement PDF"]')?.getAttribute("role"),
    ).toBe("region");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/import/sessions/s1/statements/st-failed/pdf",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("distinguishes gap rows from extracted amounts", async () => {
    await renderPanel();
    expect(container.textContent).toContain("Could not parse");
    expect(container.textContent).toContain("07-ENE-26|COMERCIO GENERICO MALO|not-an-amount");
    expect(container.textContent).toContain("COMERCIO GENERICO UNO");
    expect(container.textContent).toContain("CRC 1000.00");
  });

  it("Continue is visit-local and does not call discard or commit APIs", async () => {
    const onContinue = vi.fn();
    const fetchMock = await renderPanel(onContinue);
    const continueButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Continue",
    );
    await act(async () => {
      continueButton?.click();
    });
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls.every((call) => String(call[0]).includes("/pdf"))).toBe(true);
  });

  it("Dismiss statement POSTs dismiss and does not DELETE the session", async () => {
    const skipped: ImportSession = {
      id: "s1",
      created_at: "2026-08-18T00:00:00Z",
      discarded_at: null,
      statements: [{ ...statement, status: "skipped" }],
      undo: null,
      finalized_at: null,
      imported_new_count: 0,
      skipped_duplicate_count: 0,
      landing_list_id: null,
      deleted_count: 0,
      zero_amount_excluded_count: 0,
      failed_statements: [],
      committed_by_list: [],
    };
    dismissFailedStatement.mockResolvedValue({ ok: true, session: skipped });
    const onDismissStatement = vi.fn();
    await renderPanel(() => undefined, statement, { onDismissStatement });
    const button = Array.from(container.querySelectorAll("button")).find(
      (el) => el.textContent === "Dismiss statement",
    );
    await act(async () => {
      button?.click();
    });
    expect(dismissFailedStatement).toHaveBeenCalledWith("s1", "st-failed", expect.any(Object));
    expect(discardSession).not.toHaveBeenCalled();
    expect(onDismissStatement).toHaveBeenCalledWith(skipped);
  });

  it("Dismiss file opens discard confirm then discards the session", async () => {
    discardSession.mockResolvedValue({ ok: true });
    const onDismissFile = vi.fn();
    await renderPanel(() => undefined, statement, { onDismissFile });
    const fileButton = Array.from(container.querySelectorAll("button")).find(
      (el) => el.textContent === "Dismiss file",
    );
    await act(async () => {
      fileButton?.click();
    });
    expect(discardSession).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Discard remaining review?");
    const confirm = Array.from(container.querySelectorAll("button")).find(
      (el) => el.textContent === "Discard remaining",
    );
    await act(async () => {
      confirm?.click();
    });
    expect(discardSession).toHaveBeenCalledWith("s1", expect.any(Object));
    expect(dismissFailedStatement).not.toHaveBeenCalled();
    expect(onDismissFile).toHaveBeenCalledTimes(1);
  });

  it("exposes EN and ES dismiss keys", () => {
    expect(uploadMessages.en.parseFailureDismissStatement).toBeTruthy();
    expect(uploadMessages.es.parseFailureDismissStatement).toBeTruthy();
    expect(uploadMessages.en.parseFailureDismissFile).toBeTruthy();
    expect(uploadMessages.es.parseFailureDismissFile).toBeTruthy();
    expect(uploadMessages.en.parseFailureErrorNotFailed).toBeTruthy();
    expect(uploadMessages.es.parseFailureErrorNotFailed).toBeTruthy();
  });

  it("shows a visible gap empty-state when evidence items are missing", async () => {
    await renderPanel(() => undefined, { ...statement, parse_evidence: { items: [] } });
    expect(container.textContent).toContain("Could not parse");
    expect(container.textContent).toContain(
      "No extracted lines were saved for this statement. The original PDF is still below.",
    );
  });

  describe("Add manually", () => {
    beforeEach(() => {
      fetchLists.mockResolvedValue({ ok: true, lists: [{ id: "list-1", name: "Groceries" }] });
      fetchListMembers.mockResolvedValue({
        ok: true,
        members: [
          { user_id: "user-a", alias: "alice" },
          { user_id: "user-b", alias: "bob" },
        ],
      });
    });

    it("activating it adds a third region alongside items and PDF, pre-filled from parse_evidence, without hiding items (desktop)", async () => {
      await renderPanel();
      const addManually = Array.from(container.querySelectorAll("button")).find(
        (button) => button.textContent === "Add manually",
      );
      await act(async () => {
        addManually?.click();
      });
      await act(async () => {
        await Promise.resolve();
      });

      expect(
        container.querySelector('[aria-label="Extracted items"]')?.getAttribute("role"),
      ).toBe("region");
      expect(
        container.querySelector('[aria-label="Original statement PDF"]')?.getAttribute("role"),
      ).toBe("region");
      const manualRegion = container.querySelector('[aria-label="Manual entry"]');
      expect(manualRegion?.getAttribute("role")).toBe("region");

      const amount = manualRegion?.querySelector('input[name="amount"]') as HTMLInputElement;
      const description = manualRegion?.querySelector(
        'input[name="description"]',
      ) as HTMLInputElement;
      expect(amount.value).toBe("1000.00");
      expect(description.value).toBe("COMERCIO GENERICO UNO");

      // Every field is visible immediately, before a list is chosen.
      expect(manualRegion?.querySelector('select[name="payer_id"]')).not.toBeNull();
    });

    it("back/close returns to the prior view without calling the dismiss API", async () => {
      await renderPanel();
      const addManually = Array.from(container.querySelectorAll("button")).find(
        (button) => button.textContent === "Add manually",
      );
      await act(async () => {
        addManually?.click();
      });
      await act(async () => {
        await Promise.resolve();
      });
      expect(container.querySelector('[aria-label="Manual entry"]')).not.toBeNull();

      const back = Array.from(container.querySelectorAll("button")).find((button) =>
        button.textContent?.includes("Back"),
      );
      await act(async () => {
        back?.click();
      });

      expect(container.querySelector('[aria-label="Manual entry"]')).toBeNull();
      expect(dismissFailedStatement).not.toHaveBeenCalled();
    });

    it("submit success calls create-expense then dismiss, and closes the inline form", async () => {
      createExpense.mockResolvedValue({
        ok: true,
        expense: {
          id: "e1",
          list_id: "list-1",
          amount: "1000.00",
          currency: "CRC",
          description: "COMERCIO GENERICO UNO",
          payer_id: "user-a",
          provenance: "hand",
          line_type: "purchase",
          posted_date: "2026-01-05",
          created_at: "2026-01-05T12:00:00Z",
        },
      });
      const skipped: ImportSession = {
        id: "s1",
        created_at: "2026-08-18T00:00:00Z",
        discarded_at: null,
        statements: [{ ...statement, status: "skipped" }],
        undo: null,
        finalized_at: null,
        imported_new_count: 0,
        skipped_duplicate_count: 0,
        landing_list_id: null,
        deleted_count: 0,
        zero_amount_excluded_count: 0,
        failed_statements: [],
        committed_by_list: [],
      };
      dismissFailedStatement.mockResolvedValue({ ok: true, session: skipped });

      const onDismissStatement = vi.fn();
      await renderPanel(() => undefined, statement, { onDismissStatement });
      const addManually = Array.from(container.querySelectorAll("button")).find(
        (button) => button.textContent === "Add manually",
      );
      await act(async () => {
        addManually?.click();
      });
      await act(async () => {
        await Promise.resolve();
      });

      const list = container.querySelector('[aria-label="List"]') as HTMLSelectElement;
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")
          ?.set;
        setter?.call(list, "list-1");
        list.dispatchEvent(new Event("change", { bubbles: true }));
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      const form = container.querySelector('[aria-label="Manual entry"] form') as HTMLFormElement;
      await act(async () => {
        form.requestSubmit();
      });
      await act(async () => {
        await Promise.resolve();
      });

      const createOrder = createExpense.mock.invocationCallOrder[0];
      const dismissOrder = dismissFailedStatement.mock.invocationCallOrder[0];
      expect(createExpense).toHaveBeenCalled();
      expect(dismissFailedStatement).toHaveBeenCalledWith("s1", "st-failed", expect.any(Object));
      expect(createOrder).toBeLessThan(dismissOrder);
      expect(onDismissStatement).toHaveBeenCalledWith(skipped);
      expect(container.querySelector('[aria-label="Manual entry"]')).toBeNull();
    });
  });
});
