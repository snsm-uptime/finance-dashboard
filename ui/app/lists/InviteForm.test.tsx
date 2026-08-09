/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InviteForm } from "./InviteForm";
import { listsMessages } from "@/lib/i18n/lists";

vi.mock("./lists.module.css", () => ({
  default: new Proxy(
    {},
    {
      get: (_t, prop) => String(prop),
    },
  ),
}));

const inviteMember = vi.fn();

vi.mock("./listsClient", async () => {
  const actual = await vi.importActual<typeof import("./listsClient")>("./listsClient");
  return {
    ...actual,
    inviteMember: (...args: unknown[]) => inviteMember(...args),
  };
});

const messages = {
  inviteTitle: listsMessages.en.inviteTitle,
  inviteLabel: listsMessages.en.inviteLabel,
  inviteSubmit: listsMessages.en.inviteSubmit,
  inviteSending: listsMessages.en.inviteSending,
  inviteSent: listsMessages.en.inviteSent,
  errorGeneric: listsMessages.en.errorGeneric,
  errorInvalidName: listsMessages.en.errorInvalidName,
  errorInvalidEmail: listsMessages.en.errorInvalidEmail,
  errorForbidden: listsMessages.en.errorInviteForbidden,
  errorUnauthorized: listsMessages.en.errorUnauthorized,
  errorAlreadyMember: listsMessages.en.errorAlreadyMember,
  errorSmtp: listsMessages.en.errorSmtp,
};

async function setEmailAndSubmit(container: HTMLElement, email: string) {
  const input = container.querySelector('input[name="email"]') as HTMLInputElement;
  const form = container.querySelector("form") as HTMLFormElement;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, email);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await act(async () => {
    form.requestSubmit();
  });
}

describe("InviteForm", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    inviteMember.mockReset();
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

  it("shows invite-sent confirmation on success", async () => {
    inviteMember.mockResolvedValue({
      ok: true,
      invite: { status: "sent", template_kind: "join", invite_id: "inv-1" },
    });

    await act(async () => {
      root.render(<InviteForm listId="list-1" messages={messages} />);
    });

    await setEmailAndSubmit(container, "peer@example.com");

    expect(inviteMember).toHaveBeenCalledWith("list-1", "peer@example.com", messages);
    expect(container.querySelector('[role="status"]')?.textContent).toBe(
      listsMessages.en.inviteSent,
    );
  });

  it("shows error and does not claim sent on SMTP failure", async () => {
    inviteMember.mockResolvedValue({
      ok: false,
      error: listsMessages.en.errorSmtp,
    });

    await act(async () => {
      root.render(<InviteForm listId="list-1" messages={messages} />);
    });

    await setEmailAndSubmit(container, "peer@example.com");

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      listsMessages.en.errorSmtp,
    );
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it("clears error when the email input changes", async () => {
    inviteMember.mockResolvedValue({
      ok: false,
      error: listsMessages.en.errorSmtp,
    });

    await act(async () => {
      root.render(<InviteForm listId="list-1" messages={messages} />);
    });

    await setEmailAndSubmit(container, "peer@example.com");
    expect(container.querySelector('[role="alert"]')).not.toBeNull();

    const input = container.querySelector('input[name="email"]') as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, "other@example.com");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(container.querySelector('[role="alert"]')).toBeNull();
  });
});
