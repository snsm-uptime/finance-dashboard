/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { listsMessages } from "@/lib/i18n/lists";

import { NoOriginFilter } from "./NoOriginFilter";
import type { ExpenseItem } from "./listsClient";

vi.mock("@/components/FormIconSubmit/FormIconSubmit.module.scss", () => ({
  default: new Proxy(
    {},
    {
      get: (_t, prop) => String(prop),
    },
  ),
}));

vi.mock("@/components/soft-ledger/Select", () => ({
  SoftLedgerSelect: ({
    value,
    options,
    onChange,
    disabled,
    "aria-label": ariaLabel,
  }: {
    value: string;
    options: { value: string; label: string }[];
    onChange: (value: string) => void;
    disabled?: boolean;
    "aria-label"?: string;
  }) => (
    <select
      value={value}
      disabled={disabled}
      aria-label={ariaLabel}
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

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

const fetchCards = vi.fn();
vi.mock("../cards/cardsClient", () => ({
  fetchCards: (...args: unknown[]) => fetchCards(...args),
}));

const updateExpenseOrigin = vi.fn();
vi.mock("./listsClient", async () => {
  const actual = await vi.importActual<typeof import("./listsClient")>("./listsClient");
  return {
    ...actual,
    updateExpenseOrigin: (...args: unknown[]) => updateExpenseOrigin(...args),
  };
});

const messages = {
  noOriginFilterToggle: listsMessages.en.noOriginFilterToggle,
  noOriginFilterEmpty: listsMessages.en.noOriginFilterEmpty,
  noOriginFilterAssign: listsMessages.en.noOriginFilterAssign,
  noOriginFilterAssigning: listsMessages.en.noOriginFilterAssigning,
  noOriginFilterSelectAll: listsMessages.en.noOriginFilterSelectAll,
  expenseOriginBlank: listsMessages.en.expenseOriginBlank,
  expenseOriginCash: listsMessages.en.expenseOriginCash,
  errorGeneric: listsMessages.en.errorGeneric,
  errorInvalidName: listsMessages.en.errorInvalidName,
  errorForbidden: listsMessages.en.errorForbidden,
  errorUnauthorized: listsMessages.en.errorUnauthorized,
};

function expense(overrides: Partial<ExpenseItem> = {}): ExpenseItem {
  return {
    id: "e1",
    list_id: "list-1",
    amount: "10.00",
    currency: "CRC",
    description: "Coffee",
    payer_id: "user-a",
    provenance: "hand",
    line_type: "purchase",
    posted_date: "2026-08-06",
    created_at: "2026-08-06T12:00:00Z",
    amount_crc: "10.00",
    fx_rate: "1",
    fx_rate_date: "2026-08-06",
    fx_fallback: false,
    origin_kind: null,
    origin_card_id: null,
    ...overrides,
  };
}

describe("NoOriginFilter", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    refresh.mockReset();
    fetchCards.mockReset();
    fetchCards.mockResolvedValue({
      ok: true,
      cards: [{ id: "card-1", label: "My Visa", iban: "CR05", created_at: "2026-08-06T12:00:00Z" }],
    });
    updateExpenseOrigin.mockReset();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("filters to only origin_kind: null items", async () => {
    await act(async () => {
      root.render(
        <NoOriginFilter
          listId="list-1"
          expenses={[
            expense({ id: "e1", description: "No origin" }),
            expense({ id: "e2", description: "Has cash", origin_kind: "cash" }),
          ]}
          messages={messages}
        />,
      );
    });

    expect(container.textContent).toContain("No origin");
    expect(container.textContent).not.toContain("Has cash");
  });

  it("shows empty-state copy when none are blank-origin", async () => {
    await act(async () => {
      root.render(
        <NoOriginFilter
          listId="list-1"
          expenses={[expense({ id: "e2", origin_kind: "cash" })]}
          messages={messages}
        />,
      );
    });

    expect(container.textContent).toContain(messages.noOriginFilterEmpty);
  });

  it("individual assign calls updateExpenseOrigin once with the right ids", async () => {
    updateExpenseOrigin.mockResolvedValue({ ok: true, expense: expense() });

    await act(async () => {
      root.render(
        <NoOriginFilter
          listId="list-1"
          expenses={[expense({ id: "e1" })]}
          messages={messages}
        />,
      );
    });

    const select = container.querySelector("select") as HTMLSelectElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
      setter?.call(select, "cash");
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const assignButton = container.querySelector("button") as HTMLButtonElement;
    await act(async () => {
      assignButton.click();
    });

    expect(updateExpenseOrigin).toHaveBeenCalledTimes(1);
    expect(updateExpenseOrigin).toHaveBeenCalledWith(
      "list-1",
      "e1",
      { origin_kind: "cash", origin_card_id: null },
      messages,
    );
    expect(refresh).toHaveBeenCalled();
  });

  it("batch assign with 2 selected calls it twice, sequentially", async () => {
    updateExpenseOrigin.mockResolvedValue({ ok: true, expense: expense() });

    await act(async () => {
      root.render(
        <NoOriginFilter
          listId="list-1"
          expenses={[expense({ id: "e1" }), expense({ id: "e2" })]}
          messages={messages}
        />,
      );
    });

    const checkboxes = Array.from(
      container.querySelectorAll('input[type="checkbox"]'),
    ) as HTMLInputElement[];
    await act(async () => {
      checkboxes.forEach((cb) => cb.click());
    });

    const buttons = Array.from(container.querySelectorAll("button"));
    const selectAllButton = buttons[buttons.length - 1] as HTMLButtonElement;
    await act(async () => {
      selectAllButton.click();
    });

    expect(updateExpenseOrigin).toHaveBeenCalledTimes(2);
    expect(updateExpenseOrigin.mock.calls[0][1]).toBe("e1");
    expect(updateExpenseOrigin.mock.calls[1][1]).toBe("e2");
  });

  it("a mid-batch failure stops further calls and surfaces which row failed", async () => {
    updateExpenseOrigin
      .mockResolvedValueOnce({ ok: false, error: "Selected card is not registered to you." })
      .mockResolvedValueOnce({ ok: true, expense: expense() });

    await act(async () => {
      root.render(
        <NoOriginFilter
          listId="list-1"
          expenses={[
            expense({ id: "e1", description: "Groceries" }),
            expense({ id: "e2", description: "Coffee" }),
          ]}
          messages={messages}
        />,
      );
    });

    const checkboxes = Array.from(
      container.querySelectorAll('input[type="checkbox"]'),
    ) as HTMLInputElement[];
    await act(async () => {
      checkboxes.forEach((cb) => cb.click());
    });

    const buttons = Array.from(container.querySelectorAll("button"));
    const selectAllButton = buttons[buttons.length - 1] as HTMLButtonElement;
    await act(async () => {
      selectAllButton.click();
    });

    expect(updateExpenseOrigin).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Groceries: Selected card is not registered to you.");
  });

  it("a batch failure after a partial success clears and refreshes only the succeeded row", async () => {
    updateExpenseOrigin
      .mockResolvedValueOnce({ ok: true, expense: expense() })
      .mockResolvedValueOnce({ ok: false, error: "Selected card is not registered to you." })
      .mockResolvedValueOnce({ ok: true, expense: expense() });

    await act(async () => {
      root.render(
        <NoOriginFilter
          listId="list-1"
          expenses={[
            expense({ id: "e1", description: "Groceries" }),
            expense({ id: "e2", description: "Coffee" }),
          ]}
          messages={messages}
        />,
      );
    });

    const checkboxes = Array.from(
      container.querySelectorAll('input[type="checkbox"]'),
    ) as HTMLInputElement[];
    await act(async () => {
      checkboxes.forEach((cb) => cb.click());
    });

    const buttons = Array.from(container.querySelectorAll("button"));
    const selectAllButton = buttons[buttons.length - 1] as HTMLButtonElement;
    await act(async () => {
      selectAllButton.click();
    });

    expect(updateExpenseOrigin).toHaveBeenCalledTimes(2);
    // e1 already persisted server-side — must not be resubmitted on a retry.
    expect(refresh).toHaveBeenCalled();
    await act(async () => {
      selectAllButton.click();
    });
    expect(updateExpenseOrigin).toHaveBeenCalledTimes(3);
    expect(updateExpenseOrigin.mock.calls[2][1]).toBe("e2");
  });

  it("row assign button is disabled until an origin is chosen", async () => {
    await act(async () => {
      root.render(
        <NoOriginFilter
          listId="list-1"
          expenses={[expense({ id: "e1" })]}
          messages={messages}
        />,
      );
    });

    const assignButton = container.querySelector("button") as HTMLButtonElement;
    expect(assignButton.disabled).toBe(true);

    const select = container.querySelector("select") as HTMLSelectElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
      setter?.call(select, "cash");
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(assignButton.disabled).toBe(false);
  });
});
