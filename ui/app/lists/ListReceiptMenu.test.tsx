/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { listsMessages } from "@/lib/i18n/lists";

import { ListReceiptMenu } from "./ListReceiptMenu";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("./Sheet.module.scss", () => ({
  default: new Proxy(
    {},
    {
      get: (_t, prop) => String(prop),
    },
  ),
}));

vi.mock("@/components/IconButton/IconButton.module.scss", () => ({
  default: new Proxy(
    {},
    {
      get: (_t, prop) => String(prop),
    },
  ),
}));

vi.mock("@/components/IconButtonPopup/IconButtonPopup.module.scss", () => ({
  default: new Proxy(
    {},
    {
      get: (_t, prop) => String(prop),
    },
  ),
}));

const fetchLists = vi.fn();
const reassignStatement = vi.fn();

vi.mock("./listsClient", async () => {
  const actual = await vi.importActual<typeof import("./listsClient")>("./listsClient");
  return {
    ...actual,
    fetchLists: (...args: unknown[]) => fetchLists(...args),
    reassignStatement: (...args: unknown[]) => reassignStatement(...args),
  };
});

const messages = {
  menuAria: listsMessages.en.receiptMenuAria,
  editLabel: listsMessages.en.receiptEdit,
  deleteLabel: listsMessages.en.receiptDelete,
  moveStatementLabel: listsMessages.en.receiptMoveStatement,
  moveConfirm: listsMessages.en.receiptMoveConfirm,
  pickerTitle: listsMessages.en.receiptMovePickerTitle,
  confirmAction: listsMessages.en.receiptMoveConfirmAction,
  cancelLabel: listsMessages.en.receiptMoveCancel,
  errorGeneric: listsMessages.en.errorGeneric,
  errorInvalidName: listsMessages.en.errorInvalidName,
  errorForbidden: listsMessages.en.errorForbidden,
  errorUnauthorized: listsMessages.en.errorUnauthorized,
};

describe("ListReceiptMenu", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    fetchLists.mockReset();
    reassignStatement.mockReset();
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

  it("hides move action when statement_id is missing", () => {
    act(() => {
      root.render(
        <ListReceiptMenu listId="list-a" statementId={null} messages={messages} />,
      );
    });
    expect(container.textContent).not.toContain(messages.moveStatementLabel);
  });

  it("shows confirm copy and omits the current list from the picker", async () => {
    fetchLists.mockResolvedValue({
      ok: true,
      lists: [
        { id: "list-a", name: "Current", owner_id: "u1", role: "owner" },
        { id: "list-b", name: "Other", owner_id: "u1", role: "owner" },
      ],
    });

    act(() => {
      root.render(
        <ListReceiptMenu listId="list-a" statementId="stmt-1" messages={messages} />,
      );
    });

    const open = container.querySelector("button[aria-haspopup], button") as HTMLButtonElement;
    await act(async () => {
      open.click();
    });
    const moveItem = Array.from(document.querySelectorAll("button")).find(
      (el) => el.textContent === messages.moveStatementLabel,
    );
    expect(moveItem).toBeTruthy();
    await act(async () => {
      moveItem?.click();
    });

    expect(document.body.textContent).toContain(messages.moveConfirm);
    expect(document.body.textContent).toContain("Other");
    expect(document.body.textContent).not.toContain("Current");
  });

  it("surfaces errorForbidden when the destination is denied", async () => {
    fetchLists.mockResolvedValue({
      ok: true,
      lists: [{ id: "list-b", name: "Other", owner_id: "u1", role: "owner" }],
    });
    reassignStatement.mockResolvedValue({ ok: false, error: messages.errorForbidden });

    act(() => {
      root.render(
        <ListReceiptMenu listId="list-a" statementId="stmt-1" messages={messages} />,
      );
    });

    const trigger = container.querySelector("button") as HTMLButtonElement;
    await act(async () => {
      trigger.click();
    });
    const moveItem = Array.from(document.querySelectorAll("button")).find(
      (el) => el.textContent === messages.moveStatementLabel,
    );
    await act(async () => {
      moveItem?.click();
    });
    const dest = Array.from(document.querySelectorAll("button")).find(
      (el) => el.textContent === "Other",
    );
    await act(async () => {
      dest?.click();
    });
    const confirm = Array.from(document.querySelectorAll("button")).find(
      (el) => el.textContent === messages.confirmAction,
    );
    await act(async () => {
      confirm?.click();
    });

    expect(document.body.querySelector("[role='alert']")?.textContent).toBe(
      messages.errorForbidden,
    );
  });
});
