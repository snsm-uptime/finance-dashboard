/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CardRoutingControl } from "./CardRoutingControl";
import { cardsMessages } from "@/lib/i18n/cards";
import type { CardItem } from "./cardsClient";
import type { ListItem } from "../lists/listsClient";

const setCardRouting = vi.fn();

vi.mock("./cardsClient", async () => {
  const actual = await vi.importActual<typeof import("./cardsClient")>("./cardsClient");
  return {
    ...actual,
    setCardRouting: (...args: unknown[]) => setCardRouting(...args),
  };
});

const messages = {
  errorGeneric: cardsMessages.en.errorGeneric,
  errorUnauthorized: cardsMessages.en.errorUnauthorized,
  errorInvalidLabel: cardsMessages.en.errorInvalidLabel,
  errorInvalidIban: cardsMessages.en.errorInvalidIban,
  errorDuplicateIban: cardsMessages.en.errorDuplicateIban,
  errorForbidden: cardsMessages.en.errorForbidden,
  errorCardNotFound: cardsMessages.en.errorCardNotFound,
  routingModeFixed: cardsMessages.en.routingModeFixed,
  routingModeReview: cardsMessages.en.routingModeReview,
  routingListLabel: cardsMessages.en.routingListLabel,
  routingSave: cardsMessages.en.routingSave,
  routingSaving: cardsMessages.en.routingSaving,
};

const card: CardItem = {
  id: "c1",
  label: "My Visa",
  iban: "CR05",
  created_at: "2026-08-14T00:00:00Z",
  routing_mode: "review",
  fixed_list_id: null,
};

const lists: ListItem[] = [
  { id: "list-1", name: "Household", owner_id: "u1", role: "owner" },
  { id: "list-2", name: "Trip", owner_id: "u1", role: "owner" },
];

function saveButton(container: HTMLElement): HTMLButtonElement {
  return Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent === messages.routingSave || b.textContent === messages.routingSaving,
  ) as HTMLButtonElement;
}

function radioFor(container: HTMLElement, label: string): HTMLInputElement {
  const wrapper = Array.from(container.querySelectorAll("label")).find((l) =>
    l.textContent?.includes(label),
  );
  return wrapper?.querySelector('input[type="radio"]') as HTMLInputElement;
}

async function chooseListOption(container: HTMLElement, label: string) {
  const trigger = container.querySelector('button[aria-haspopup="listbox"]') as HTMLButtonElement;
  await act(async () => {
    trigger.click();
  });
  const option = Array.from(container.querySelectorAll('li[role="option"]')).find(
    (li) => li.textContent === label,
  ) as HTMLLIElement;
  await act(async () => {
    option.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  });
}

describe("CardRoutingControl", () => {
  let container: HTMLDivElement;
  let root: Root;
  const onUpdated = vi.fn();

  beforeEach(() => {
    setCardRouting.mockReset();
    onUpdated.mockReset();
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

  it("defaults to the card's current mode and hides the list select in review mode", async () => {
    await act(async () => {
      root.render(
        <CardRoutingControl card={card} lists={lists} messages={messages} onUpdated={onUpdated} />,
      );
    });

    expect(radioFor(container, messages.routingModeReview).checked).toBe(true);
    expect(container.querySelector('button[aria-haspopup="listbox"]')).toBeNull();
  });

  it("switching to Fixed disables Save until a list is chosen", async () => {
    await act(async () => {
      root.render(
        <CardRoutingControl card={card} lists={lists} messages={messages} onUpdated={onUpdated} />,
      );
    });

    await act(async () => {
      radioFor(container, messages.routingModeFixed).click();
    });

    expect(saveButton(container).disabled).toBe(true);

    await chooseListOption(container, "Household");

    expect(saveButton(container).disabled).toBe(false);
  });

  it("Save in Fixed mode calls setCardRouting with the chosen list", async () => {
    setCardRouting.mockResolvedValue({
      ok: true,
      card: { ...card, routing_mode: "fixed", fixed_list_id: "list-1" },
    });

    await act(async () => {
      root.render(
        <CardRoutingControl card={card} lists={lists} messages={messages} onUpdated={onUpdated} />,
      );
    });

    await act(async () => {
      radioFor(container, messages.routingModeFixed).click();
    });
    await chooseListOption(container, "Household");
    await act(async () => {
      saveButton(container).click();
    });

    expect(setCardRouting).toHaveBeenCalledWith(
      "c1",
      { routing_mode: "fixed", fixed_list_id: "list-1" },
      messages,
    );
    expect(onUpdated).toHaveBeenCalledWith({ ...card, routing_mode: "fixed", fixed_list_id: "list-1" });
  });

  it("switching to Review then Save clears fixed_list_id", async () => {
    const fixedCard: CardItem = { ...card, routing_mode: "fixed", fixed_list_id: "list-1" };
    setCardRouting.mockResolvedValue({
      ok: true,
      card: { ...fixedCard, routing_mode: "review", fixed_list_id: null },
    });

    await act(async () => {
      root.render(
        <CardRoutingControl card={fixedCard} lists={lists} messages={messages} onUpdated={onUpdated} />,
      );
    });

    await act(async () => {
      radioFor(container, messages.routingModeReview).click();
    });
    await act(async () => {
      saveButton(container).click();
    });

    expect(setCardRouting).toHaveBeenCalledWith(
      "c1",
      { routing_mode: "review", fixed_list_id: null },
      messages,
    );
  });

  it("shows a 403 error via the error region", async () => {
    setCardRouting.mockResolvedValue({ ok: false, error: messages.errorForbidden });

    await act(async () => {
      root.render(
        <CardRoutingControl card={card} lists={lists} messages={messages} onUpdated={onUpdated} />,
      );
    });

    await act(async () => {
      radioFor(container, messages.routingModeFixed).click();
    });
    await chooseListOption(container, "Trip");
    await act(async () => {
      saveButton(container).click();
    });

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(messages.errorForbidden);
    expect(onUpdated).not.toHaveBeenCalled();
  });
});
