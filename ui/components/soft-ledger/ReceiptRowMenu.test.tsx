/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ReceiptRowMenu, type ReceiptRowMenuMessages } from "./ReceiptRowMenu";

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
  it("renders move item action when onMoveItem is provided", () => {
    act(() => {
      root.render(
        <ReceiptRowMenu
          messages={messages}
          onMoveItem={() => {}}
        />,
      );
    });
    expect(container.textContent).toContain(messages.moveItemLabel);
  });

  it("renders move statement action when onMoveStatement is provided and moveStatementLabel exists", () => {
    act(() => {
      root.render(
        <ReceiptRowMenu
          messages={messages}
          onMoveStatement={() => {}}
        />,
      );
    });
    expect(container.textContent).toContain(messages.moveStatementLabel);
  });

  it("hides move statement action when moveStatementLabel is undefined", () => {
    const messagesWithoutStatement = { ...messages, moveStatementLabel: undefined };
    act(() => {
      root.render(
        <ReceiptRowMenu
          messages={messagesWithoutStatement}
          onMoveStatement={() => {}}
        />,
      );
    });
    expect(container.textContent).not.toContain("Move statement");
  });

  it("renders both move item and move statement actions when both are provided", () => {
    act(() => {
      root.render(
        <ReceiptRowMenu
          messages={messages}
          onMoveItem={() => {}}
          onMoveStatement={() => {}}
        />,
      );
    });
    expect(container.textContent).toContain(messages.moveItemLabel);
    expect(container.textContent).toContain(messages.moveStatementLabel);
  });

  it("hides move item action when onMoveItem is undefined", () => {
    act(() => {
      root.render(
        <ReceiptRowMenu
          messages={messages}
          onMoveStatement={() => {}}
        />,
      );
    });
    expect(container.textContent).not.toContain(messages.moveItemLabel);
  });
});
