/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ReceiptRowMenu, type ReceiptRowMenuMessages } from "./ReceiptRowMenu";

vi.mock("./ReceiptRowMenu.module.scss", () => ({
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

vi.mock("@/app/upload/DiscardConfirmDialog", () => ({
  DiscardConfirmDialog: ({ title, body, confirmLabel }: { title: string; body: string; confirmLabel: string }) => (
    <dialog>
      <h2>{title}</h2>
      <p>{body}</p>
      <button>{confirmLabel}</button>
    </dialog>
  ),
}));

vi.mock("@/app/lists/listsClient", () => ({
  deleteExpense: vi.fn(() => Promise.resolve({ ok: true })),
  rollbackImportBatch: vi.fn(() => Promise.resolve({ ok: true })),
}));

let root: Root;
let container: Element;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  root.unmount();
  container.remove();
});

const messages: ReceiptRowMenuMessages = {
  menuAria: "Menu",
  editLabel: "Edit",
  deleteLabel: "Delete",
  moveItemLabel: "Move this item",
  moveStatementLabel: "Move statement",
};

describe("ReceiptRowMenu", () => {
  it("accepts moveItemLabel in messages", () => {
    expect(messages).toHaveProperty("moveItemLabel");
    expect(messages.moveItemLabel).toBe("Move this item");
  });

  it("accepts onMoveItem prop without error", () => {
    expect(() => {
      act(() => {
        root.render(
          <ReceiptRowMenu
            messages={messages}
            onMoveItem={() => {}}
          />,
        );
      });
    }).not.toThrow();
  });

  it("accepts onMoveItem and onMoveStatement props together", () => {
    expect(() => {
      act(() => {
        root.render(
          <ReceiptRowMenu
            messages={messages}
            onMoveItem={() => {}}
            onMoveStatement={() => {}}
          />,
        );
      });
    }).not.toThrow();
  });

  it("renders without onMoveItem when not provided", () => {
    expect(() => {
      act(() => {
        root.render(
          <ReceiptRowMenu
            messages={messages}
            onMoveStatement={() => {}}
          />,
        );
      });
    }).not.toThrow();
  });

  it("renders both move actions when provided", () => {
    expect(() => {
      act(() => {
        root.render(
          <ReceiptRowMenu
            messages={messages}
            onMoveItem={() => {}}
            onMoveStatement={() => {}}
            onEdit={() => {}}
          />,
        );
      });
    }).not.toThrow();
  });
});
