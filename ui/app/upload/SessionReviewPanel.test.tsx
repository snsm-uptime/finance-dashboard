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
  useCardIdentification: () => ({
    cardMatched: false,
    cardId: undefined,
    cardLabel: undefined,
    iban: null,
    loading: false,
    error: null,
    needsRegistration: false,
    registerCard: vi.fn(),
  }),
}));

vi.mock("@/components/PreferencesProvider", () => ({
  usePreferences: () => ({ locale: "en" as const }),
}));

vi.mock("@/hooks", () => ({
  useFormSubmission: (fn: any) => ({
    submit: vi.fn((arg) => {
      fn(arg);
      return Promise.resolve({ ok: true });
    }),
    pending: false,
    error: null,
  }),
}));

const mockSession: ImportSession = {
  id: "sess1",
  created_at: "2026-08-20T10:00:00Z",
  discarded_at: null,
  statements: [
    {
      id: "st1",
      product_id: "Card 1234",
      status: "staged",
      candidate_row_count: 10,
      iban: "DE89370400440532013000",
      filename: "statement.pdf",
      card_id: "card1",
    },
    {
      id: "st2",
      product_id: "Card 5678",
      status: "staged",
      candidate_row_count: 5,
      iban: "ES9121000418450200051332",
      filename: "statement2.pdf",
      card_id: null,
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

  it("renders statements with card info", async () => {
    await act(async () => {
      root.render(<SessionReviewPanel session={mockSession} />);
    });

    expect(container.textContent).toContain("Card 1234");
    expect(container.textContent).toContain("Card 5678");
    expect(container.textContent).toContain("DE89370400440532013000");
    expect(container.textContent).toContain("ES9121000418450200051332");
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
