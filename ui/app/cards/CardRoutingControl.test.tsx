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
  routingTitle: cardsMessages.en.routingTitle,
  routingChipFixed: cardsMessages.en.routingChipFixed,
  routingChipReview: cardsMessages.en.routingChipReview,
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

function routingChip(container: HTMLElement): HTMLButtonElement {
  return container.querySelector('button[aria-controls]') as HTMLButtonElement;
}

function radioFor(container: HTMLElement, label: string): HTMLInputElement {
  const wrapper = Array.from(container.querySelectorAll("label")).find((l) =>
    l.textContent?.includes(label),
  );
  return wrapper?.querySelector('input[type="radio"]') as HTMLInputElement;
}

async function expandRouting(container: HTMLElement) {
  const chip = routingChip(container);
  if (chip.getAttribute("aria-expanded") === "true") return;
  await act(async () => {
    chip.click();
  });
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

  it("renders a compact row with a Review chip and keeps the form collapsed", async () => {
    await act(async () => {
      root.render(
        <CardRoutingControl card={card} lists={lists} messages={messages} onUpdated={onUpdated} />,
      );
    });

    const chip = routingChip(container);
    expect(container.textContent).toContain("My Visa");
    expect(chip.textContent).toContain(messages.routingChipReview);
    expect(chip.getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector('[role="region"]')?.getAttribute("aria-hidden")).toBe("true");
  });

  it("shows a Fixed chip for a card whose saved routing is fixed", async () => {
    const fixedCard: CardItem = { ...card, routing_mode: "fixed", fixed_list_id: "list-1" };
    await act(async () => {
      root.render(
        <CardRoutingControl
          card={fixedCard}
          lists={lists}
          messages={messages}
          onUpdated={onUpdated}
        />,
      );
    });

    expect(routingChip(container).textContent).toContain(messages.routingChipFixed);
    expect(routingChip(container).getAttribute("aria-label")).toBe(
      `${messages.routingTitle}: ${messages.routingChipFixed}`,
    );
  });

  it("slides the current routing form open when the chip is clicked", async () => {
    await act(async () => {
      root.render(
        <CardRoutingControl card={card} lists={lists} messages={messages} onUpdated={onUpdated} />,
      );
    });

    await expandRouting(container);

    expect(routingChip(container).getAttribute("aria-expanded")).toBe("true");
    expect(radioFor(container, messages.routingModeReview).checked).toBe(true);
    expect(container.querySelector('button[aria-haspopup="listbox"]')).toBeNull();
  });

  it("clicking the card label does not open the form", async () => {
    await act(async () => {
      root.render(
        <CardRoutingControl card={card} lists={lists} messages={messages} onUpdated={onUpdated} />,
      );
    });

    const label = Array.from(container.querySelectorAll("span")).find(
      (el) => el.textContent === "My Visa",
    ) as HTMLSpanElement;
    await act(async () => {
      label.click();
    });

    expect(routingChip(container).getAttribute("aria-expanded")).toBe("false");
  });

  it("switching to Fixed disables Save until a list is chosen", async () => {
    await act(async () => {
      root.render(
        <CardRoutingControl card={card} lists={lists} messages={messages} onUpdated={onUpdated} />,
      );
    });

    await expandRouting(container);
    await act(async () => {
      radioFor(container, messages.routingModeFixed).click();
    });

    expect(saveButton(container).disabled).toBe(true);

    await chooseListOption(container, "Household");

    expect(saveButton(container).disabled).toBe(false);
  });

  it("Save in Fixed mode calls setCardRouting with the chosen list and collapses", async () => {
    setCardRouting.mockResolvedValue({
      ok: true,
      card: { ...card, routing_mode: "fixed", fixed_list_id: "list-1" },
    });

    await act(async () => {
      root.render(
        <CardRoutingControl card={card} lists={lists} messages={messages} onUpdated={onUpdated} />,
      );
    });

    await expandRouting(container);
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
    expect(routingChip(container).getAttribute("aria-expanded")).toBe("false");
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

    await expandRouting(container);
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

  it("keeps the chip on the saved mode while the draft is unsaved", async () => {
    await act(async () => {
      root.render(
        <CardRoutingControl card={card} lists={lists} messages={messages} onUpdated={onUpdated} />,
      );
    });

    await expandRouting(container);
    await act(async () => {
      radioFor(container, messages.routingModeFixed).click();
    });

    expect(routingChip(container).textContent).toContain(messages.routingChipReview);
  });

  it("shows a 403 error via the error region", async () => {
    setCardRouting.mockResolvedValue({ ok: false, error: messages.errorForbidden });

    await act(async () => {
      root.render(
        <CardRoutingControl card={card} lists={lists} messages={messages} onUpdated={onUpdated} />,
      );
    });

    await expandRouting(container);
    await act(async () => {
      radioFor(container, messages.routingModeFixed).click();
    });
    await chooseListOption(container, "Trip");
    await act(async () => {
      saveButton(container).click();
    });

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(messages.errorForbidden);
    expect(onUpdated).not.toHaveBeenCalled();
    expect(routingChip(container).getAttribute("aria-expanded")).toBe("true");
  });
});
