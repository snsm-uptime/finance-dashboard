/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SessionReviewPanel } from "./SessionReviewPanel";
import type { ImportSession } from "./uploadClient";

const discardSession = vi.fn();
const fetchImportSession = vi.fn();

vi.mock("./uploadClient", async () => {
  const actual = await vi.importActual<typeof import("./uploadClient")>("./uploadClient");
  return {
    ...actual,
    discardSession: (...args: unknown[]) => discardSession(...args),
    fetchImportSession: (...args: unknown[]) => fetchImportSession(...args),
  };
});

vi.mock("@/hooks/useCardIdentification", () => ({
  useCardIdentification: (
    _sessionId: string,
    statement: { card_id: string | null; iban: string | null } | null,
  ) => ({
    cardMatched: Boolean(statement?.card_id),
    cardId: statement?.card_id ?? undefined,
    cardLabel: statement?.card_id ? "My Visa" : undefined,
    iban: statement?.iban ?? null,
    loading: false,
    error: null,
    needsRegistration: Boolean(statement?.iban && !statement?.card_id),
    registerCard: vi.fn(),
  }),
}));

vi.mock("@/components/PreferencesProvider", () => ({
  usePreferences: () => ({ locale: "en" as const }),
}));

type MockSubmitFn = (data: unknown) => Promise<{ ok: boolean; error?: string }>;

vi.mock("@/hooks", () => ({
  useFormSubmission: (fn: MockSubmitFn) => ({
    submit: vi.fn((arg: unknown) => {
      fn(arg);
      return Promise.resolve({ ok: true });
    }),
    pending: false,
    error: null,
  }),
}));

vi.mock("@/components/IconButton/IconButton.module.scss", () => ({
  default: new Proxy(
    {},
    {
      get: (_t, prop) => String(prop),
    },
  ),
}));

const mockSession: ImportSession = {
  id: "sess1",
  created_at: "2026-08-20T10:00:00Z",
  discarded_at: null,
  undo: null,
  finalized_at: null,
  imported_new_count: 0,
  skipped_duplicate_count: 0,
  landing_list_id: null,
  statements: [
    {
      id: "st1",
      product_id: "bac_credit",
      status: "staged",
      candidate_row_count: 10,
      iban: "DE89370400440532013000",
      filename: "statement.pdf",
      card_id: "card1",
      rows: [],
      zero_amount_excluded_count: 0,
    },
    {
      id: "st2",
      product_id: "bac_credit",
      status: "staged",
      candidate_row_count: 5,
      iban: "ES9121000418450200051332",
      filename: "statement2.pdf",
      card_id: null,
      rows: [],
      zero_amount_excluded_count: 0,
    },
  ],
};

describe("SessionReviewPanel", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.clearAllMocks();
  });

  afterEach(() => {
    root.unmount();
    document.body.removeChild(container);
  });

  it("titles a matched statement with the uploaded filename, not product_id", async () => {
    await act(async () => {
      root.render(<SessionReviewPanel session={mockSession} />);
    });

    expect(container.textContent).toContain("statement.pdf");
    expect(container.textContent).toContain("From your My Visa card");
    expect(container.textContent).toContain("DE89370400440532013000");
    expect(container.textContent).not.toContain("bac_credit");
  });

  it("titles an unmatched statement New card! with IBAN and a save form", async () => {
    await act(async () => {
      root.render(<SessionReviewPanel session={mockSession} />);
    });

    expect(container.textContent).toContain("New card!");
    expect(container.textContent).toContain("ES9121000418450200051332");
    const save = container.querySelector('button[aria-label="Register"]');
    expect(save).not.toBeNull();
    expect(container.querySelector('input[name="label"]')).not.toBeNull();
  });

  it("shows Discard and Assign to a list buttons", async () => {
    await act(async () => {
      root.render(<SessionReviewPanel session={mockSession} />);
    });

    const buttons = Array.from(container.querySelectorAll("button, a"));
    const buttonTexts = buttons.map((b) => b.textContent);

    expect(buttonTexts).toContain("Discard");
    expect(buttonTexts).toContain("Assign to a list");
  });

  it("bulk review link has correct href", async () => {
    await act(async () => {
      root.render(<SessionReviewPanel session={mockSession} />);
    });

    const link = container.querySelector('a[href*="/upload/bulk/"]') as HTMLAnchorElement;
    expect(link?.href).toContain("/upload/bulk/sess1");
  });
});
