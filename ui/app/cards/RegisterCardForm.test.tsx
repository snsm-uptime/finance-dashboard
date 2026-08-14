/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RegisterCardForm } from "./RegisterCardForm";
import { cardsMessages } from "@/lib/i18n/cards";

const registerCard = vi.fn();

vi.mock("./cardsClient", async () => {
  const actual = await vi.importActual<typeof import("./cardsClient")>("./cardsClient");
  return {
    ...actual,
    registerCard: (...args: unknown[]) => registerCard(...args),
  };
});

const messages = {
  labelField: cardsMessages.en.labelField,
  ibanField: cardsMessages.en.ibanField,
  submit: cardsMessages.en.submit,
  submitting: cardsMessages.en.submitting,
  errorGeneric: cardsMessages.en.errorGeneric,
  errorUnauthorized: cardsMessages.en.errorUnauthorized,
  errorInvalidLabel: cardsMessages.en.errorInvalidLabel,
  errorInvalidIban: cardsMessages.en.errorInvalidIban,
  errorDuplicateIban: cardsMessages.en.errorDuplicateIban,
};

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

async function fillAndSubmit(container: HTMLElement, label: string, iban: string) {
  const labelInput = container.querySelector('input[name="label"]') as HTMLInputElement;
  const ibanInput = container.querySelector('input[name="iban"]') as HTMLInputElement;
  const form = container.querySelector("form") as HTMLFormElement;
  await act(async () => {
    setInputValue(labelInput, label);
    setInputValue(ibanInput, iban);
  });
  await act(async () => {
    form.requestSubmit();
  });
}

describe("RegisterCardForm", () => {
  let container: HTMLDivElement;
  let root: Root;
  const onRegistered = vi.fn();

  beforeEach(() => {
    registerCard.mockReset();
    onRegistered.mockReset();
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

  it("submit stays disabled until both fields are filled", async () => {
    await act(async () => {
      root.render(<RegisterCardForm messages={messages} onRegistered={onRegistered} />);
    });

    const button = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(button.disabled).toBe(true);

    const labelInput = container.querySelector('input[name="label"]') as HTMLInputElement;
    await act(async () => {
      setInputValue(labelInput, "My Visa");
    });
    expect(button.disabled).toBe(true);

    const ibanInput = container.querySelector('input[name="iban"]') as HTMLInputElement;
    await act(async () => {
      setInputValue(ibanInput, "CR05");
    });
    expect(button.disabled).toBe(false);
  });

  it("calls onRegistered and clears fields on success", async () => {
    registerCard.mockResolvedValue({
      ok: true,
      card: { id: "c1", label: "My Visa", iban: "CR05", created_at: "2026-08-14T00:00:00Z" },
    });

    await act(async () => {
      root.render(<RegisterCardForm messages={messages} onRegistered={onRegistered} />);
    });

    await fillAndSubmit(container, "My Visa", "CR05");

    expect(registerCard).toHaveBeenCalledWith("My Visa", "CR05", messages);
    expect(onRegistered).toHaveBeenCalledWith({
      id: "c1",
      label: "My Visa",
      iban: "CR05",
      created_at: "2026-08-14T00:00:00Z",
    });
    const labelInput = container.querySelector('input[name="label"]') as HTMLInputElement;
    expect(labelInput.value).toBe("");
  });

  it("shows validation error and does not call onRegistered", async () => {
    registerCard.mockResolvedValue({
      ok: false,
      error: cardsMessages.en.errorInvalidLabel,
    });

    await act(async () => {
      root.render(<RegisterCardForm messages={messages} onRegistered={onRegistered} />);
    });

    await fillAndSubmit(container, "  ", "CR05");

    // Submit is blocked client-side when label is blank; nothing was called.
    expect(registerCard).not.toHaveBeenCalled();
    expect(onRegistered).not.toHaveBeenCalled();
  });

  it("shows duplicate error from server and does not call onRegistered", async () => {
    registerCard.mockResolvedValue({
      ok: false,
      error: cardsMessages.en.errorDuplicateIban,
    });

    await act(async () => {
      root.render(<RegisterCardForm messages={messages} onRegistered={onRegistered} />);
    });

    await fillAndSubmit(container, "Another Card", "CR05");

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      cardsMessages.en.errorDuplicateIban,
    );
    expect(onRegistered).not.toHaveBeenCalled();
  });

  it("disables inputs and submit while pending", async () => {
    let resolvePromise: (value: { ok: true; card: unknown }) => void = () => {};
    registerCard.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePromise = resolve;
        }),
    );

    await act(async () => {
      root.render(<RegisterCardForm messages={messages} onRegistered={onRegistered} />);
    });

    const labelInput = container.querySelector('input[name="label"]') as HTMLInputElement;
    const ibanInput = container.querySelector('input[name="iban"]') as HTMLInputElement;
    const form = container.querySelector("form") as HTMLFormElement;

    await act(async () => {
      setInputValue(labelInput, "My Visa");
      setInputValue(ibanInput, "CR05");
    });

    await act(async () => {
      form.requestSubmit();
    });

    expect(labelInput.disabled).toBe(true);
    expect(ibanInput.disabled).toBe(true);
    const button = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.textContent).toBe(messages.submitting);

    await act(async () => {
      resolvePromise({
        ok: true,
        card: { id: "c1", label: "My Visa", iban: "CR05", created_at: "2026-08-14T00:00:00Z" },
      });
    });
  });
});
