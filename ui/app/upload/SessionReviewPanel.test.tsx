/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SessionReviewPanel } from "./SessionReviewPanel";
import type { ImportSession } from "./uploadClient";

const discardSession = vi.fn();
const fetchImportSession = vi.fn();
const fetchCards = vi.fn();
const assignRow = vi.fn();
const replace = vi.fn();

vi.mock("./uploadClient", async () => {
  const actual = await vi.importActual<typeof import("./uploadClient")>("./uploadClient");
  return {
    ...actual,
    discardSession: (...args: unknown[]) => discardSession(...args),
    fetchImportSession: (...args: unknown[]) => fetchImportSession(...args),
    assignRow: (...args: unknown[]) => assignRow(...args),
  };
});

vi.mock("@/app/cards/cardsClient", () => ({
  fetchCards: (...args: unknown[]) => fetchCards(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
}));

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
  deleted_count: 0,
  zero_amount_excluded_count: 0,
  failed_statements: [],
  committed_by_list: [],
  statements: [
    {
      id: "st1",
      product_id: "bac_credit",
      status: "staged",
      candidate_row_count: 2,
      iban: "DE89370400440532013000",
      filename: "statement.pdf",
      card_id: "card1",
      rows: [
        {
          id: "r1",
          sequence: 1,
          description: "Store",
          amount: "10.00",
          currency: "CRC",
          posted_date: "2026-07-15",
          status: "pending",
        },
        {
          id: "r2",
          sequence: 2,
          description: "Cafe",
          amount: "5.00",
          currency: "CRC",
          posted_date: "2026-08-03",
          status: "pending",
        },
      ],
      zero_amount_excluded_count: 0,
      assigned_rows: [],
    },
    {
      id: "st2",
      product_id: "bac_credit",
      status: "failed",
      candidate_row_count: 0,
      iban: "ES9121000418450200051332",
      filename: "statement2.pdf",
      card_id: null,
      rows: [],
      zero_amount_excluded_count: 0,
      assigned_rows: [],
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
    fetchCards.mockResolvedValue({ ok: true, cards: [] });
  });

  afterEach(() => {
    root.unmount();
    document.body.removeChild(container);
  });

  it("maps a matched statement onto the credit-card face", async () => {
    await act(async () => {
      root.render(<SessionReviewPanel session={mockSession} />);
    });

    expect(container.textContent).toContain("My Visa");
    expect(container.textContent).toContain("statement.pdf");
    expect(container.textContent).toContain("IBAN: DE89 3704 0044 0532 0130 00");
    expect(container.textContent).toContain("JUL-AUG 26");
    expect(container.textContent).toContain("Period");
    expect(container.textContent).not.toContain("08-20");
    expect(container.textContent).not.toContain("bac_credit");
  });

  it("lets an unmatched statement name the card on the face", async () => {
    await act(async () => {
      root.render(<SessionReviewPanel session={mockSession} />);
    });

    const nameInput = container.querySelector('input[name="label"]') as HTMLInputElement;
    expect(nameInput).not.toBeNull();
    expect(nameInput.placeholder).toBe("New card!");
    expect(container.textContent).toContain("IBAN: ES91 2100 0418 4502 0005 1332");
    expect(container.textContent).toContain("statement2.pdf");
    expect(container.querySelector('button[aria-label="Register"]')).not.toBeNull();
  });

  it("puts a close control on each card and hides assign until the card is saved", async () => {
    await act(async () => {
      root.render(<SessionReviewPanel session={mockSession} />);
    });

    const cards = Array.from(container.querySelectorAll("li"));
    expect(cards).toHaveLength(2);

    const closeButtons = container.querySelectorAll('button[aria-label="Close"]');
    expect(closeButtons).toHaveLength(2);
    expect(container.textContent).not.toContain("Discard");

    const matched = cards[0];
    const unmatched = cards[1];
    expect(matched.textContent).toContain("Assign to a list");
    expect(matched.textContent).toContain("Review individually");
    expect(unmatched.querySelector('input[name="label"]')).not.toBeNull();
    expect(unmatched.textContent).not.toContain("Assign to a list");
    expect(unmatched.textContent).not.toContain("Review individually");
  });

  it("bulk review link has correct href on a saved card", async () => {
    await act(async () => {
      root.render(<SessionReviewPanel session={mockSession} />);
    });

    const link = container.querySelector('a[href*="/upload/bulk/"]') as HTMLAnchorElement;
    expect(link?.href).toContain("/upload/bulk/sess1");
    expect(container.querySelectorAll('a[href*="/upload/bulk/"]')).toHaveLength(1);
  });

  it("centers the statement column at the individual-review max width", async () => {
    await act(async () => {
      root.render(<SessionReviewPanel session={mockSession} />);
    });

    const section = container.querySelector("section");
    expect(section?.className).toContain("items-center");
    expect(section?.className).toContain("justify-center");

    const list = container.querySelector("ul");
    expect(list?.className).toContain("max-w-[26rem]");
    expect(list?.className).not.toContain("max-w-[28rem]");

    const cards = Array.from(container.querySelectorAll("li"));
    expect(cards).toHaveLength(2);
    for (const card of cards) {
      expect(card.className).toContain("max-w-[26rem]");
      expect(card.className).not.toContain("max-w-md");
    }

    const actions = cards[0].querySelector("div.flex.flex-wrap");
    expect(actions?.className).toContain("justify-center");
  });

  it("individual review link has correct href on a saved card", async () => {
    await act(async () => {
      root.render(<SessionReviewPanel session={mockSession} />);
    });

    const link = container.querySelector('a[href*="/upload/review/"]') as HTMLAnchorElement;
    expect(link?.href).toContain("/upload/review/sess1");
    expect(container.querySelectorAll('a[href*="/upload/review/"]')).toHaveLength(1);
  });

  it("hides Bulk and offers Resume for a partial session", async () => {
    const partial: ImportSession = {
      ...mockSession,
      imported_new_count: 1,
      statements: [
        {
          ...mockSession.statements[0],
          candidate_row_count: 2,
          rows: [mockSession.statements[0].rows[0]],
        },
      ],
    };
    await act(async () => {
      root.render(<SessionReviewPanel session={partial} />);
    });

    expect(container.textContent).toContain("Resume review");
    expect(container.querySelector('a[href*="/upload/review/sess1"]')).not.toBeNull();
    expect(container.querySelector('a[href*="/upload/bulk/"]')).toBeNull();
    expect(container.textContent).not.toContain("Assign to a list");
  });

  it("Resume for a sheet-waiting session still goes to the review route", async () => {
    const waiting: ImportSession = {
      ...mockSession,
      statements: mockSession.statements.map((statement) => ({
        ...statement,
        rows: [],
        candidate_row_count: statement.candidate_row_count,
      })),
    };
    await act(async () => {
      root.render(<SessionReviewPanel session={waiting} />);
    });

    const resume = container.querySelector('a[href*="/upload/review/"]') as HTMLAnchorElement;
    expect(resume?.href).toContain("/upload/review/sess1");
    expect(container.querySelector('a[href*="/upload/bulk/"]')).toBeNull();
  });

  describe("card-routing auto-navigation (Story 4.19)", () => {
    const singleMatchedSession: ImportSession = {
      ...mockSession,
      statements: [mockSession.statements[0]],
    };

    it("auto-assigns every pending row to the card's fixed list, then routes to individual review", async () => {
      fetchCards.mockResolvedValue({
        ok: true,
        cards: [
          {
            id: "card1",
            label: "My Visa",
            iban: "DE89370400440532013000",
            created_at: "2026-01-01T00:00:00Z",
            routing_mode: "fixed",
            fixed_list_id: "list-9",
          },
        ],
      });
      assignRow.mockResolvedValue({ ok: true, session: singleMatchedSession });

      await act(async () => {
        root.render(<SessionReviewPanel session={singleMatchedSession} />);
      });
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(assignRow).toHaveBeenCalledWith(
        "sess1",
        "r1",
        "list-9",
        expect.anything(),
      );
      expect(assignRow).toHaveBeenCalledWith(
        "sess1",
        "r2",
        "list-9",
        expect.anything(),
      );
      expect(replace).toHaveBeenCalledWith("/upload/review/sess1");
    });

    it("routes straight to individual review when the card is set to review", async () => {
      fetchCards.mockResolvedValue({
        ok: true,
        cards: [
          {
            id: "card1",
            label: "My Visa",
            iban: "DE89370400440532013000",
            created_at: "2026-01-01T00:00:00Z",
            routing_mode: "review",
            fixed_list_id: null,
          },
        ],
      });

      await act(async () => {
        root.render(<SessionReviewPanel session={singleMatchedSession} />);
      });
      await act(async () => {
        await Promise.resolve();
      });

      expect(replace).toHaveBeenCalledWith("/upload/review/sess1");
    });

    it("falls back to the Assign/Review choice when matched cards disagree on their fixed list", async () => {
      const mixedSession: ImportSession = {
        ...mockSession,
        statements: [
          mockSession.statements[0],
          {
            ...mockSession.statements[0],
            id: "st3",
            card_id: "card2",
            candidate_row_count: 1,
            rows: [{ ...mockSession.statements[0].rows[0], id: "r3" }],
          },
        ],
      };
      fetchCards.mockResolvedValue({
        ok: true,
        cards: [
          {
            id: "card1",
            label: "My Visa",
            iban: "DE89370400440532013000",
            created_at: "2026-01-01T00:00:00Z",
            routing_mode: "fixed",
            fixed_list_id: "list-9",
          },
          {
            id: "card2",
            label: "My Mastercard",
            iban: "ES9121000418450200051332",
            created_at: "2026-01-01T00:00:00Z",
            routing_mode: "fixed",
            fixed_list_id: "list-10",
          },
        ],
      });

      await act(async () => {
        root.render(<SessionReviewPanel session={mixedSession} />);
      });
      await act(async () => {
        await Promise.resolve();
      });

      expect(replace).not.toHaveBeenCalled();
      expect(container.textContent).toContain("Assign to a list");
    });

    it("does not auto-route while a statement still needs card registration", async () => {
      fetchCards.mockResolvedValue({
        ok: true,
        cards: [
          {
            id: "card1",
            label: "My Visa",
            iban: "DE89370400440532013000",
            created_at: "2026-01-01T00:00:00Z",
            routing_mode: "fixed",
            fixed_list_id: "list-9",
          },
        ],
      });

      await act(async () => {
        root.render(<SessionReviewPanel session={mockSession} />);
      });
      await act(async () => {
        await Promise.resolve();
      });

      expect(replace).not.toHaveBeenCalled();
    });
  });
});
