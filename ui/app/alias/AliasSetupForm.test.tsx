/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { aliasMessages } from "@/lib/i18n/alias";

import { AliasSetupForm } from "./AliasSetupForm";

vi.mock("../signup/signup.module.css", () => ({
  default: new Proxy(
    {},
    {
      get: (_t, prop) => String(prop),
    },
  ),
}));

const replace = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh }),
}));

const setAlias = vi.fn();
vi.mock("./aliasClient", async () => {
  const actual = await vi.importActual<typeof import("./aliasClient")>("./aliasClient");
  return {
    ...actual,
    setAlias: (...args: unknown[]) => setAlias(...args),
  };
});

const messages = aliasMessages.en;

describe("AliasSetupForm", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    setAlias.mockReset();
    replace.mockReset();
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

  async function render(continueHref = "/lists") {
    await act(async () => {
      root.render(<AliasSetupForm messages={messages} continueHref={continueHref} />);
    });
  }

  async function type(value: string) {
    const input = container.querySelector('input[name="alias"]') as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  async function submit() {
    const form = container.querySelector("form") as HTMLFormElement;
    await act(async () => {
      form.requestSubmit();
    });
  }

  it("shows the alias field with the format hint and no email field", async () => {
    await render();
    expect(container.querySelector('input[name="alias"]')).not.toBeNull();
    expect(container.querySelector('input[type="email"]')).toBeNull();
    expect(container.textContent).toContain(messages.hint);
  });

  it("continues to the return destination after a successful claim", async () => {
    setAlias.mockResolvedValue({ ok: true, alias: "alice" });
    await render("/lists/list-1");
    await type("Alice");
    await submit();

    expect(setAlias).toHaveBeenCalledWith("alice", messages);
    expect(replace).toHaveBeenCalledWith("/lists/list-1");
    expect(refresh).toHaveBeenCalled();
  });

  it("keeps the user on setup and shows the error when the alias is taken", async () => {
    setAlias.mockResolvedValue({ ok: false, error: messages.errorTaken });
    await render();
    await type("alice");
    await submit();

    expect(replace).not.toHaveBeenCalled();
    expect(container.textContent).toContain(messages.errorTaken);
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
  });

  it("shows the format error for an invalid alias", async () => {
    setAlias.mockResolvedValue({ ok: false, error: messages.errorInvalid });
    await render();
    await type("ab");
    await submit();

    expect(container.textContent).toContain(messages.errorInvalid);
  });
});
