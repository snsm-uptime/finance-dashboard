/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { listsMessages } from "@/lib/i18n/lists";

import { ManualExpenseForm } from "./ManualExpenseForm";

vi.mock("./ManualExpenseForm.module.css", () => ({
  default: new Proxy(
    {},
    {
      get: (_t, prop) => String(prop),
    },
  ),
}));

vi.mock("./FormIconSubmit.module.css", () => ({
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

  it("omits split_override when Adjust split is collapsed", async () => {
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

  it("includes whole_assignee override when Adjust split is open", async () => {
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

    const details = container.querySelector("details") as HTMLDetailsElement;
    await act(async () => {
      details.open = true;
      details.dispatchEvent(new Event("toggle", { bubbles: true }));
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

    const details = container.querySelector("details") as HTMLDetailsElement;
    await act(async () => {
      details.open = true;
      details.dispatchEvent(new Event("toggle", { bubbles: true }));
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
    const button = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(button).not.toBeNull();
    expect(button.getAttribute("aria-label")).toBe(messages.expenseSubmit);
    expect(button.disabled).toBe(true);

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

    expect(button.disabled).toBe(false);
  });
});
