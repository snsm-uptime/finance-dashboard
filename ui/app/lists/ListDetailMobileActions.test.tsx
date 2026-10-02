/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { listsMessages } from "@/lib/i18n/lists";

vi.mock("next/link", () => ({
  default: ({ children, href }: any) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/components/IconButton", () => ({
  IconButton: ({ label, icon, onClick, ...props }: any) => (
    <button onClick={onClick} {...props} aria-label={label}>
      {icon}
      {label}
    </button>
  ),
}));

vi.mock("./Sheet", () => ({
  Sheet: ({ title, body, open }: any) => (open ? <div>{title}{body}</div> : null),
}));

vi.mock("./ManualExpenseForm", () => ({
  ManualExpenseForm: () => <div>ManualExpenseForm</div>,
}));

vi.mock("./DefaultSplitPanel", () => ({
  DefaultSplitPanel: () => <div>DefaultSplitPanel</div>,
}));

vi.mock("./InviteForm", () => ({
  InviteForm: () => <div>InviteForm</div>,
}));

vi.mock("./lists.module.scss", () => ({
  default: new Proxy({}, { get: (_t, prop) => String(prop) }),
}));

vi.mock("@/components/FormIconSubmit", () => ({
  FormIconSubmit: ({ label }: any) => <button>{label}</button>,
}));

import { ListDetailMobileActions } from "./ListDetailMobileActions";

const t = listsMessages.en;

describe("ListDetailMobileActions - Task 1: Import statement entry point", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it("renders the import statement button with accessible name including list name", async () => {
    const listName = "My Groceries";
    const root = createRoot(container);
    let component: any;

    await act(async () => {
      root.render(
        <ListDetailMobileActions
          listId="list-123"
          currentUserId="user-1"
          members={[]}
          isOwner={true}
          canInvite={true}
          canAddExpense={true}
          defaultSplit={null}
          expenseMessages={{
            expenseTitle: "",
            expenseAmount: "",
            expenseCurrency: "",
            expenseCurrencyCrc: "",
            expenseCurrencyUsd: "",
            expenseDateLabel: "",
            expenseDescription: "",
            expensePayer: "",
            expenseSubmit: "",
            expenseSaving: "",
            expenseAdjustSplit: "",
            expenseModeWhole: "",
            expenseModeAbsolute: "",
            expenseModePercentage: "",
            expenseAssignee: "",
            expenseOriginLabel: "",
            expenseOriginBlank: "",
            expenseOriginCash: "",
            errorGeneric: "",
            errorInvalidName: "",
            errorForbidden: "",
            errorUnauthorized: "",
          }}
          inviteMessages={{
            inviteTitle: "",
            inviteLabel: "",
            inviteSubmit: "",
            inviteSending: "",
            inviteSent: "",
            errorGeneric: "",
            errorInvalidName: "",
            errorInvalidEmail: "",
            errorForbidden: "",
            errorUnauthorized: "",
            errorAlreadyMember: "",
            errorSmtp: "",
          }}
          splitMessages={{
            defaultSplitTitle: "",
            defaultSplitEven: "",
            defaultSplitCustom: "",
            defaultSplitSum: "",
            defaultSplitSave: "",
            defaultSplitSaving: "",
            defaultSplitReadOnly: "",
            errorGeneric: "",
            errorInvalidName: "",
            errorForbidden: "",
            errorUnauthorized: "",
            errorInvalidSplit: "",
          }}
          addExpenseAria="Add expense"
          inviteAria="Invite someone"
          importStatementAria={t.importStatementAria.replace("{list}", listName)}
          closeLabel="Close"
        />
      );
    });

    const importButton = container.querySelector(`a[href*="listId=list-123"]`);
    expect(importButton).toExist();
    expect(importButton?.textContent).toContain(t.importStatementAria.replace("{list}", listName));
  });

  it("links to /upload with the listId query parameter", async () => {
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <ListDetailMobileActions
          listId="list-abc"
          currentUserId="user-1"
          members={[]}
          isOwner={true}
          canInvite={true}
          canAddExpense={true}
          defaultSplit={null}
          expenseMessages={{
            expenseTitle: "",
            expenseAmount: "",
            expenseCurrency: "",
            expenseCurrencyCrc: "",
            expenseCurrencyUsd: "",
            expenseDateLabel: "",
            expenseDescription: "",
            expensePayer: "",
            expenseSubmit: "",
            expenseSaving: "",
            expenseAdjustSplit: "",
            expenseModeWhole: "",
            expenseModeAbsolute: "",
            expenseModePercentage: "",
            expenseAssignee: "",
            expenseOriginLabel: "",
            expenseOriginBlank: "",
            expenseOriginCash: "",
            errorGeneric: "",
            errorInvalidName: "",
            errorForbidden: "",
            errorUnauthorized: "",
          }}
          inviteMessages={{
            inviteTitle: "",
            inviteLabel: "",
            inviteSubmit: "",
            inviteSending: "",
            inviteSent: "",
            errorGeneric: "",
            errorInvalidName: "",
            errorInvalidEmail: "",
            errorForbidden: "",
            errorUnauthorized: "",
            errorAlreadyMember: "",
            errorSmtp: "",
          }}
          splitMessages={{
            defaultSplitTitle: "",
            defaultSplitEven: "",
            defaultSplitCustom: "",
            defaultSplitSum: "",
            defaultSplitSave: "",
            defaultSplitSaving: "",
            defaultSplitReadOnly: "",
            errorGeneric: "",
            errorInvalidName: "",
            errorForbidden: "",
            errorUnauthorized: "",
            errorInvalidSplit: "",
          }}
          addExpenseAria="Add expense"
          inviteAria="Invite someone"
          importStatementAria="Import statement"
          closeLabel="Close"
        />
      );
    });

    const importLink = container.querySelector(`a[href*="/upload?listId=list-abc"]`);
    expect(importLink).toExist();
  });
});
