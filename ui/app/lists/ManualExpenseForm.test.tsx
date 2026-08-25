/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { listsMessages } from "@/lib/i18n/lists";

import { ManualExpenseForm } from "./ManualExpenseForm";

vi.mock("./ManualExpenseForm.module.scss", () => ({
  default: new Proxy(
    {},
    {
      get: (_t, prop) => String(prop),
    },
  ),
}));

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
    id,
    name,
    value,
    options,
    onChange,
    disabled,
    "aria-labelledby": labelledBy,
  }: {
    id?: string;
    name?: string;
    value: string;
    options: { value: string; label: string }[];
    onChange: (value: string) => void;
    disabled?: boolean;
    "aria-labelledby"?: string;
  }) => (
    <select
      id={id}
      name={name}
      value={value}
      disabled={disabled}
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

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

const createExpense = vi.fn();

vi.mock("./listsClient", async () => {
  const actual = await vi.importActual<typeof import("./listsClient")>("./listsClient");
  return {
    ...actual,
    createExpense: (...args: unknown[]) => createExpense(...args),
  };
});

const fetchCards = vi.fn();

vi.mock("../cards/cardsClient", () => ({
  fetchCards: (...args: unknown[]) => fetchCards(...args),
}));

const members = [
  { user_id: "user-a", alias: "alice" },
  { user_id: "user-b", alias: "bob" },
];

const messages = {
  expenseTitle: listsMessages.en.expenseTitle,
  expenseAmount: listsMessages.en.expenseAmount,
  expenseDescription: listsMessages.en.expenseDescription,
  expensePayer: listsMessages.en.expensePayer,
  expenseSubmit: listsMessages.en.expenseSubmit,
  expenseSaving: listsMessages.en.expenseSaving,
  expenseAdjustSplit: listsMessages.en.expenseAdjustSplit,
  expenseModeWhole: listsMessages.en.expenseModeWhole,
  expenseModeAbsolute: listsMessages.en.expenseModeAbsolute,
  expenseModePercentage: listsMessages.en.expenseModePercentage,
  expenseAssignee: listsMessages.en.expenseAssignee,
  expenseOriginLabel: listsMessages.en.expenseOriginLabel,
  expenseOriginBlank: listsMessages.en.expenseOriginBlank,
  expenseOriginCash: listsMessages.en.expenseOriginCash,
  errorGeneric: listsMessages.en.errorGeneric,
  errorInvalidName: listsMessages.en.errorInvalidName,
  errorForbidden: listsMessages.en.errorForbidden,
  errorUnauthorized: listsMessages.en.errorUnauthorized,
};

describe("ManualExpenseForm", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    createExpense.mockReset();
    refresh.mockReset();
    fetchCards.mockReset();
    fetchCards.mockResolvedValue({
      ok: true,
      cards: [{ id: "card-1", label: "My Visa", iban: "CR05", created_at: "2026-08-06T12:00:00Z" }],
    });
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

  it("defaults payer select to currentUserId", async () => {
    await act(async () => {
      root.render(
        <ManualExpenseForm
          listId="list-1"
          currentUserId="user-b"
          members={members}
          messages={messages}
        />,
      );
    });
    const select = container.querySelector('select[name="payer_id"]') as HTMLSelectElement;
    expect(select.value).toBe("user-b");
  });

  it("starts on percentages matching the list default and omits split_override when unchanged", async () => {
    createExpense.mockResolvedValue({
      ok: true,
      expense: {
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
      },
    });

    await act(async () => {
      root.render(
        <ManualExpenseForm
          listId="list-1"
          currentUserId="user-a"
          members={members}
          messages={messages}
        />,
      );
    });

    const percent = container.querySelector(
      '[aria-label="Percentages"]',
    ) as HTMLButtonElement;
    expect(percent.getAttribute("aria-checked")).toBe("true");

    const amount = container.querySelector('input[name="amount"]') as HTMLInputElement;
    const description = container.querySelector(
      'input[name="description"]',
    ) as HTMLInputElement;
    const form = container.querySelector("form") as HTMLFormElement;

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(amount, "10.00");
      amount.dispatchEvent(new Event("input", { bubbles: true }));
      setter?.call(description, "Coffee");
      description.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await act(async () => {
      form.requestSubmit();
    });

    expect(createExpense).toHaveBeenCalledWith(
      "list-1",
      expect.objectContaining({
        amount: "10.00",
        description: "Coffee",
        payer_id: "user-a",
        currency: "CRC",
      }),
      expect.anything(),
    );
    const body = createExpense.mock.calls[0][1] as { split_override?: unknown };
    expect(body.split_override).toBeUndefined();
    expect(refresh).toHaveBeenCalled();
  });

  it("prefills the percentage track from the list default split", async () => {
    await act(async () => {
      root.render(
        <ManualExpenseForm
          listId="list-1"
          currentUserId="user-a"
          members={members}
          defaultSplit={{
            list_id: "list-1",
            owner_id: "user-a",
            mode: "percentage",
            member_ids: ["user-a", "user-b"],
            shares: [
              { user_id: "user-a", percentage: "70" },
              { user_id: "user-b", percentage: "30" },
            ],
          }}
          messages={messages}
        />,
      );
    });

    expect(container.textContent).toContain("70%");
    expect(container.textContent).toContain("30%");
  });

  it("includes whole_assignee override when that split mode is selected", async () => {
    createExpense.mockResolvedValue({
      ok: true,
      expense: {
        id: "e2",
        list_id: "list-1",
        amount: "5.00",
        currency: "CRC",
        description: "Taxi",
        payer_id: "user-a",
        provenance: "hand",
        line_type: "purchase",
        posted_date: "2026-08-06",
        created_at: "2026-08-06T12:00:00Z",
      },
    });

    await act(async () => {
      root.render(
        <ManualExpenseForm
          listId="list-1"
          currentUserId="user-a"
          members={members}
          messages={messages}
        />,
      );
    });

    const whole = container.querySelector(
      '[aria-label="Whole line to one person"]',
    ) as HTMLButtonElement;
    await act(async () => {
      whole.click();
    });

    const amount = container.querySelector('input[name="amount"]') as HTMLInputElement;
    const description = container.querySelector(
      'input[name="description"]',
    ) as HTMLInputElement;
    const form = container.querySelector("form") as HTMLFormElement;

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(amount, "5.00");
      amount.dispatchEvent(new Event("input", { bubbles: true }));
      setter?.call(description, "Taxi");
      description.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await act(async () => {
      form.requestSubmit();
    });

    const body = createExpense.mock.calls[0][1] as {
      split_override?: { kind: string; assignee_id?: string };
    };
    expect(body.split_override).toEqual({
      kind: "whole_assignee",
      assignee_id: "user-a",
    });
  });

  it("surfaces API detail for invalid_split_override", async () => {
    createExpense.mockResolvedValue({
      ok: false,
      error: "Percentages must sum to exactly 100.",
    });

    await act(async () => {
      root.render(
        <ManualExpenseForm
          listId="list-1"
          currentUserId="user-a"
          members={members}
          messages={messages}
        />,
      );
    });

    const amount = container.querySelector('input[name="amount"]') as HTMLInputElement;
    const description = container.querySelector(
      'input[name="description"]',
    ) as HTMLInputElement;
    const form = container.querySelector("form") as HTMLFormElement;

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(amount, "5.00");
      amount.dispatchEvent(new Event("input", { bubbles: true }));
      setter?.call(description, "Bad");
      description.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await act(async () => {
      form.requestSubmit();
    });

    expect(container.textContent).toContain("Percentages must sum to exactly 100.");
  });

  it("labels payer and assignee options with aliases, never emails", async () => {
    await act(async () => {
      root.render(
        <ManualExpenseForm
          listId="list-1"
          currentUserId="user-a"
          members={members}
          messages={messages}
        />,
      );
    });

    const whole = container.querySelector(
      '[aria-label="Whole line to one person"]',
    ) as HTMLButtonElement;
    await act(async () => {
      whole.click();
    });

    const optionLabels = Array.from(container.querySelectorAll("option")).map(
      (o) => o.textContent,
    );
    expect(optionLabels).toContain("alice");
    expect(optionLabels).toContain("bob");
    expect(container.textContent).not.toContain("@");
  });

  it("falls back to a short id when a member has no alias yet", async () => {
    await act(async () => {
      root.render(
        <ManualExpenseForm
          listId="list-1"
          currentUserId="user-a"
          members={[
            { user_id: "user-a", alias: "alice" },
            { user_id: "0123456789abcdef", alias: null },
          ]}
          messages={messages}
        />,
      );
    });

    const optionLabels = Array.from(container.querySelectorAll("option")).map(
      (o) => o.textContent,
    );
    expect(optionLabels).toContain("01234567…");
  });

  it("submit control is an icon button, disabled until amount and description are set", async () => {
    const onCanSubmitChange = vi.fn();
    await act(async () => {
      root.render(
        <ManualExpenseForm
          listId="list-1"
          currentUserId="user-a"
          members={members}
          messages={messages}
          onCanSubmitChange={onCanSubmitChange}
        />,
      );
    });
    // Form starts empty, so canSubmit should be false
    expect(onCanSubmitChange).toHaveBeenCalledWith(false);

    const amount = container.querySelector('input[name="amount"]') as HTMLInputElement;
    const description = container.querySelector(
      'input[name="description"]',
    ) as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(amount, "10");
      amount.dispatchEvent(new Event("input", { bubbles: true }));
      amount.dispatchEvent(new Event("change", { bubbles: true }));
      setter?.call(description, "Coffee");
      description.dispatchEvent(new Event("input", { bubbles: true }));
      description.dispatchEvent(new Event("change", { bubbles: true }));
    });

    // After filling both fields, canSubmit should be true
    expect(onCanSubmitChange).toHaveBeenLastCalledWith(true);
  });

  it("renders the desktop inline save when formRef is omitted, and it fills the row", async () => {
    await act(async () => {
      root.render(
        <ManualExpenseForm
          listId="list-1"
          currentUserId="user-a"
          members={members}
          messages={messages}
        />,
      );
    });

    const form = container.querySelector("form") as HTMLFormElement;
    const inlineSave = form.querySelector('button[type="submit"]');
    expect(inlineSave).not.toBeNull();
    expect(inlineSave?.className.split(/\s+/)).toContain("!w-full");
  });

  it("omits the inline save when formRef is provided (e.g. mobile Sheet corner action)", async () => {
    const formRef = { current: null };
    await act(async () => {
      root.render(
        <ManualExpenseForm
          listId="list-1"
          currentUserId="user-a"
          members={members}
          messages={messages}
          formRef={formRef}
        />,
      );
    });

    const form = container.querySelector("form") as HTMLFormElement;
    expect(form.querySelector('button[type="submit"]')).toBeNull();
  });

  it("keeps the inline save disabled/enabled matching canSubmit (empty vs filled amount+description)", async () => {
    await act(async () => {
      root.render(
        <ManualExpenseForm
          listId="list-1"
          currentUserId="user-a"
          members={members}
          messages={messages}
        />,
      );
    });

    const form = container.querySelector("form") as HTMLFormElement;
    const submitButton = form.querySelector(
      'button[type="submit"]',
    ) as HTMLButtonElement;
    expect(submitButton.disabled).toBe(true);

    const amount = container.querySelector('input[name="amount"]') as HTMLInputElement;
    const description = container.querySelector(
      'input[name="description"]',
    ) as HTMLInputElement;

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(amount, "10.00");
      amount.dispatchEvent(new Event("input", { bubbles: true }));
      setter?.call(description, "Coffee");
      description.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(submitButton.disabled).toBe(false);
  });

  it("origin defaults to blank", async () => {
    await act(async () => {
      root.render(
        <ManualExpenseForm
          listId="list-1"
          currentUserId="user-a"
          members={members}
          messages={messages}
        />,
      );
    });
    const origin = container.querySelector('select[name="origin"]') as HTMLSelectElement;
    expect(origin.value).toBe("");
  });

  it("selecting Cash then submitting sends origin_kind cash", async () => {
    createExpense.mockResolvedValue({
      ok: true,
      expense: {
        id: "e3",
        list_id: "list-1",
        amount: "10.00",
        currency: "CRC",
        description: "Coffee",
        payer_id: "user-a",
        provenance: "hand",
        line_type: "purchase",
        posted_date: "2026-08-06",
        created_at: "2026-08-06T12:00:00Z",
      },
    });

    await act(async () => {
      root.render(
        <ManualExpenseForm
          listId="list-1"
          currentUserId="user-a"
          members={members}
          messages={messages}
        />,
      );
    });

    const amount = container.querySelector('input[name="amount"]') as HTMLInputElement;
    const description = container.querySelector(
      'input[name="description"]',
    ) as HTMLInputElement;
    const origin = container.querySelector('select[name="origin"]') as HTMLSelectElement;
    const form = container.querySelector("form") as HTMLFormElement;

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(amount, "10.00");
      amount.dispatchEvent(new Event("input", { bubbles: true }));
      setter?.call(description, "Coffee");
      description.dispatchEvent(new Event("input", { bubbles: true }));
      const selectSetter = Object.getOwnPropertyDescriptor(
        HTMLSelectElement.prototype,
        "value",
      )?.set;
      selectSetter?.call(origin, "cash");
      origin.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await act(async () => {
      form.requestSubmit();
    });

    expect(createExpense).toHaveBeenCalledWith(
      "list-1",
      expect.objectContaining({ origin_kind: "cash", origin_card_id: null }),
      expect.anything(),
    );
  });

  it("selecting a card then submitting sends origin_kind card with the card id", async () => {
    createExpense.mockResolvedValue({
      ok: true,
      expense: {
        id: "e4",
        list_id: "list-1",
        amount: "10.00",
        currency: "CRC",
        description: "Coffee",
        payer_id: "user-a",
        provenance: "hand",
        line_type: "purchase",
        posted_date: "2026-08-06",
        created_at: "2026-08-06T12:00:00Z",
      },
    });

    await act(async () => {
      root.render(
        <ManualExpenseForm
          listId="list-1"
          currentUserId="user-a"
          members={members}
          messages={messages}
        />,
      );
    });

    const amount = container.querySelector('input[name="amount"]') as HTMLInputElement;
    const description = container.querySelector(
      'input[name="description"]',
    ) as HTMLInputElement;
    const origin = container.querySelector('select[name="origin"]') as HTMLSelectElement;
    const form = container.querySelector("form") as HTMLFormElement;

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(amount, "10.00");
      amount.dispatchEvent(new Event("input", { bubbles: true }));
      setter?.call(description, "Coffee");
      description.dispatchEvent(new Event("input", { bubbles: true }));
      const selectSetter = Object.getOwnPropertyDescriptor(
        HTMLSelectElement.prototype,
        "value",
      )?.set;
      selectSetter?.call(origin, "card-1");
      origin.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await act(async () => {
      form.requestSubmit();
    });

    expect(createExpense).toHaveBeenCalledWith(
      "list-1",
      expect.objectContaining({ origin_kind: "card", origin_card_id: "card-1" }),
      expect.anything(),
    );
  });

  it("zero cards: dropdown still renders with just blank/Cash and submit is not blocked", async () => {
    fetchCards.mockResolvedValue({ ok: true, cards: [] });

    await act(async () => {
      root.render(
        <ManualExpenseForm
          listId="list-1"
          currentUserId="user-a"
          members={members}
          messages={messages}
        />,
      );
    });

    const origin = container.querySelector('select[name="origin"]') as HTMLSelectElement;
    const optionValues = Array.from(origin.querySelectorAll("option")).map((o) => o.value);
    expect(optionValues).toEqual(["", "cash"]);

    const amount = container.querySelector('input[name="amount"]') as HTMLInputElement;
    const description = container.querySelector(
      'input[name="description"]',
    ) as HTMLInputElement;
    const form = container.querySelector("form") as HTMLFormElement;
    const submitButton = form.querySelector('button[type="submit"]') as HTMLButtonElement;

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(amount, "10.00");
      amount.dispatchEvent(new Event("input", { bubbles: true }));
      setter?.call(description, "Coffee");
      description.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(submitButton.disabled).toBe(false);
  });

  it("hides the Origin select when a non-self payer is selected", async () => {
    await act(async () => {
      root.render(
        <ManualExpenseForm
          listId="list-1"
          currentUserId="user-a"
          members={members}
          messages={messages}
        />,
      );
    });

    expect(container.querySelector('select[name="origin"]')).not.toBeNull();

    const payer = container.querySelector('select[name="payer_id"]') as HTMLSelectElement;
    await act(async () => {
      const selectSetter = Object.getOwnPropertyDescriptor(
        HTMLSelectElement.prototype,
        "value",
      )?.set;
      selectSetter?.call(payer, "user-b");
      payer.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(container.querySelector('select[name="origin"]')).toBeNull();
  });

  it("clears the origin selection and omits it from the request when switching to a non-self payer", async () => {
    createExpense.mockResolvedValue({
      ok: true,
      expense: {
        id: "e5",
        list_id: "list-1",
        amount: "10.00",
        currency: "CRC",
        description: "Coffee",
        payer_id: "user-b",
        provenance: "hand",
        line_type: "purchase",
        posted_date: "2026-08-06",
        created_at: "2026-08-06T12:00:00Z",
      },
    });

    await act(async () => {
      root.render(
        <ManualExpenseForm
          listId="list-1"
          currentUserId="user-a"
          members={members}
          messages={messages}
        />,
      );
    });

    const amount = container.querySelector('input[name="amount"]') as HTMLInputElement;
    const description = container.querySelector(
      'input[name="description"]',
    ) as HTMLInputElement;
    const origin = container.querySelector('select[name="origin"]') as HTMLSelectElement;
    const payer = container.querySelector('select[name="payer_id"]') as HTMLSelectElement;
    const selectSetter = Object.getOwnPropertyDescriptor(
      HTMLSelectElement.prototype,
      "value",
    )?.set;

    await act(async () => {
      const inputSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      inputSetter?.call(amount, "10.00");
      amount.dispatchEvent(new Event("input", { bubbles: true }));
      inputSetter?.call(description, "Coffee");
      description.dispatchEvent(new Event("input", { bubbles: true }));
      selectSetter?.call(origin, "card-1");
      origin.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await act(async () => {
      selectSetter?.call(payer, "user-b");
      payer.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const form = container.querySelector("form") as HTMLFormElement;
    await act(async () => {
      form.requestSubmit();
    });

    expect(createExpense).toHaveBeenCalledWith(
      "list-1",
      expect.objectContaining({
        payer_id: "user-b",
        origin_kind: null,
        origin_card_id: null,
      }),
      expect.anything(),
    );
  });

  it("resets Origin to blank when switching back to self after a non-self detour", async () => {
    await act(async () => {
      root.render(
        <ManualExpenseForm
          listId="list-1"
          currentUserId="user-a"
          members={members}
          messages={messages}
        />,
      );
    });

    const payer = container.querySelector('select[name="payer_id"]') as HTMLSelectElement;
    const selectSetter = Object.getOwnPropertyDescriptor(
      HTMLSelectElement.prototype,
      "value",
    )?.set;
    const origin = container.querySelector('select[name="origin"]') as HTMLSelectElement;

    await act(async () => {
      selectSetter?.call(origin, "card-1");
      origin.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await act(async () => {
      selectSetter?.call(payer, "user-b");
      payer.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await act(async () => {
      selectSetter?.call(payer, "user-a");
      payer.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const originAfter = container.querySelector('select[name="origin"]') as HTMLSelectElement;
    expect(originAfter).not.toBeNull();
    expect(originAfter.value).toBe("");
  });

  it("does not submit a payer id that is missing from memberships", async () => {
    await act(async () => {
      root.render(
        <ManualExpenseForm
          listId="list-1"
          currentUserId="user-z"
          members={members}
          messages={messages}
        />,
      );
    });

    const amount = container.querySelector('input[name="amount"]') as HTMLInputElement;
    const description = container.querySelector(
      'input[name="description"]',
    ) as HTMLInputElement;
    const form = container.querySelector("form") as HTMLFormElement;
    const submitButton = form.querySelector(
      'button[type="submit"]',
    ) as HTMLButtonElement;

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(amount, "10.00");
      amount.dispatchEvent(new Event("input", { bubbles: true }));
      setter?.call(description, "Coffee");
      description.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(submitButton.disabled).toBe(true);
    await act(async () => {
      form.requestSubmit();
    });
    expect(createExpense).not.toHaveBeenCalled();
  });
});
