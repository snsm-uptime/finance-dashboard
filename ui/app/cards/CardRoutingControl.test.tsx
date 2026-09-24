/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CardRoutingControl } from "./CardRoutingControl";
import { cardsMessages } from "@/lib/i18n/cards";
import type { CardItem } from "./cardsClient";
import type { ListItem } from "../lists/listsClient";

const setCardRouting = vi.fn();
const setCardLabel = vi.fn();

vi.mock("./cardsClient", async () => {
  const actual = await vi.importActual<typeof import("./cardsClient")>("./cardsClient");
  return {
    ...actual,
    setCardRouting: (...args: unknown[]) => setCardRouting(...args),
    setCardLabel: (...args: unknown[]) => setCardLabel(...args),
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
  renameLabel: cardsMessages.en.renameLabel,
};

const card: CardItem = {
  id: "c1",
  label: "My Visa",
  iban: "CR05",
  created_at: "2026-08-14T00:00:00Z",
  routing_mode: "review",
  fixed_list_id: null,
  is_archived: false,
};

const lists: ListItem[] = [
  { id: "list-1", name: "Household", owner_id: "u1", role: "owner" },
  { id: "list-2", name: "Trip", owner_id: "u1", role: "owner" },
];

function routingChip(container: HTMLElement): HTMLButtonElement {
  return container.querySelector('button[aria-controls]') as HTMLButtonElement;
}

function menuOption(container: HTMLElement, label: string): HTMLButtonElement {
  return Array.from(container.querySelectorAll('[role="region"] button')).find(
    (b) => b.textContent === label,
  ) as HTMLButtonElement;
}

async function expandRouting(container: HTMLElement) {
  const chip = routingChip(container);
  if (chip.getAttribute("aria-expanded") === "true") return;
  await act(async () => {
    chip.click();
  });
}

describe("CardRoutingControl", () => {
  let container: HTMLDivElement;
  let root: Root;
  const onUpdated = vi.fn();
  const onLabelUpdated = vi.fn();

  beforeEach(() => {
    setCardRouting.mockReset();
    setCardLabel.mockReset();
    onUpdated.mockReset();
    onLabelUpdated.mockReset();
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

  it("renders a compact row with a Review chip and keeps the menu collapsed", async () => {
    await act(async () => {
      root.render(
        <CardRoutingControl card={card} lists={lists} messages={messages} onUpdated={onUpdated} onLabelUpdated={onLabelUpdated} />,
      );
    });

    const chip = routingChip(container);
    expect(container.textContent).toContain("My Visa");
    expect(chip.textContent).toContain(messages.routingChipReview);
    expect(chip.getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector('[role="region"]')?.getAttribute("aria-hidden")).toBe("true");
  });

  it("shows the fixed list's name for a card whose saved routing is fixed", async () => {
    const fixedCard: CardItem = { ...card, routing_mode: "fixed", fixed_list_id: "list-1" };
    await act(async () => {
      root.render(
        <CardRoutingControl
          card={fixedCard}
          lists={lists}
          messages={messages}
          onUpdated={onUpdated}
          onLabelUpdated={onLabelUpdated}
        />,
      );
    });

    expect(routingChip(container).textContent).toContain("Household");
    expect(routingChip(container).getAttribute("aria-label")).toBe(
      `${messages.routingTitle}: Household`,
    );
  });

  it("falls back to the generic Fixed label when the saved list is gone", async () => {
    const fixedCard: CardItem = { ...card, routing_mode: "fixed", fixed_list_id: "list-missing" };
    await act(async () => {
      root.render(
        <CardRoutingControl
          card={fixedCard}
          lists={lists}
          messages={messages}
          onUpdated={onUpdated}
          onLabelUpdated={onLabelUpdated}
        />,
      );
    });

    expect(routingChip(container).textContent).toContain(messages.routingChipFixed);
  });

  it("slides a menu of Review + list chips open, excluding the current setting", async () => {
    await act(async () => {
      root.render(
        <CardRoutingControl card={card} lists={lists} messages={messages} onUpdated={onUpdated} onLabelUpdated={onLabelUpdated} />,
      );
    });

    await expandRouting(container);

    expect(routingChip(container).getAttribute("aria-expanded")).toBe("true");
    // Card is already in Review mode, so "Review" is not offered again.
    expect(menuOption(container, messages.routingChipReview)).toBeUndefined();
    expect(menuOption(container, "Household")).toBeTruthy();
    expect(menuOption(container, "Trip")).toBeTruthy();
  });

  it("clicking the card label does not open the menu", async () => {
    await act(async () => {
      root.render(
        <CardRoutingControl card={card} lists={lists} messages={messages} onUpdated={onUpdated} onLabelUpdated={onLabelUpdated} />,
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

  it("picking a list chip saves fixed routing to that list and collapses", async () => {
    setCardRouting.mockResolvedValue({
      ok: true,
      card: { ...card, routing_mode: "fixed", fixed_list_id: "list-1" },
    });

    await act(async () => {
      root.render(
        <CardRoutingControl card={card} lists={lists} messages={messages} onUpdated={onUpdated} onLabelUpdated={onLabelUpdated} />,
      );
    });

    await expandRouting(container);
    await act(async () => {
      menuOption(container, "Household").click();
    });

    expect(setCardRouting).toHaveBeenCalledWith(
      "c1",
      { routing_mode: "fixed", fixed_list_id: "list-1" },
      messages,
    );
    expect(onUpdated).toHaveBeenCalledWith({ ...card, routing_mode: "fixed", fixed_list_id: "list-1" });
    expect(routingChip(container).getAttribute("aria-expanded")).toBe("false");
  });

  it("picking the Review chip saves review routing and clears fixed_list_id", async () => {
    const fixedCard: CardItem = { ...card, routing_mode: "fixed", fixed_list_id: "list-1" };
    setCardRouting.mockResolvedValue({
      ok: true,
      card: { ...fixedCard, routing_mode: "review", fixed_list_id: null },
    });

    await act(async () => {
      root.render(
        <CardRoutingControl card={fixedCard} lists={lists} messages={messages} onUpdated={onUpdated} onLabelUpdated={onLabelUpdated} />,
      );
    });

    await expandRouting(container);
    await act(async () => {
      menuOption(container, messages.routingChipReview).click();
    });

    expect(setCardRouting).toHaveBeenCalledWith(
      "c1",
      { routing_mode: "review", fixed_list_id: null },
      messages,
    );
  });

  it("shows a 403 error via the error region and keeps the menu open", async () => {
    setCardRouting.mockResolvedValue({ ok: false, error: messages.errorForbidden });

    await act(async () => {
      root.render(
        <CardRoutingControl card={card} lists={lists} messages={messages} onUpdated={onUpdated} onLabelUpdated={onLabelUpdated} />,
      );
    });

    await expandRouting(container);
    await act(async () => {
      menuOption(container, "Trip").click();
    });

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(messages.errorForbidden);
    expect(onUpdated).not.toHaveBeenCalled();
    expect(routingChip(container).getAttribute("aria-expanded")).toBe("true");
  });

  function labelSpan(): HTMLSpanElement {
    return Array.from(container.querySelectorAll("span")).find(
      (el) => el.textContent === "My Visa",
    ) as HTMLSpanElement;
  }

  function labelInput(): HTMLInputElement | null {
    return container.querySelector("input");
  }

  // React tracks a controlled input's "last known value" via a patched
  // native setter, so `input.value = x` alone leaves the tracker already in
  // sync and the subsequent "input" event's onChange never fires. Calling
  // the original native setter directly (bypassing React's patch) avoids
  // that — mirrors IndividualReviewPanel.test.tsx's setFieldValue.
  function setFieldValue(field: HTMLInputElement, value: string) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!
      .set!;
    setter.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  }

  describe("inline label rename", () => {
    it("first click primes without mounting an input or calling the network", async () => {
      await act(async () => {
        root.render(
          <CardRoutingControl card={card} lists={lists} messages={messages} onUpdated={onUpdated} onLabelUpdated={onLabelUpdated} />,
        );
      });

      await act(async () => {
        labelSpan().click();
      });

      expect(labelInput()).toBeNull();
      expect(setCardLabel).not.toHaveBeenCalled();
    });

    it("second click mounts a focused, pre-filled input", async () => {
      await act(async () => {
        root.render(
          <CardRoutingControl card={card} lists={lists} messages={messages} onUpdated={onUpdated} onLabelUpdated={onLabelUpdated} />,
        );
      });

      await act(async () => {
        labelSpan().click();
      });
      await act(async () => {
        labelSpan().click();
      });

      const input = labelInput();
      expect(input).not.toBeNull();
      expect(input?.value).toBe("My Visa");
      expect(document.activeElement).toBe(input);
    });

    it("Enter with changed text calls setCardLabel and returns to idle on success", async () => {
      setCardLabel.mockResolvedValue({ ok: true, card: { ...card, label: "Renamed" } });

      await act(async () => {
        root.render(
          <CardRoutingControl card={card} lists={lists} messages={messages} onUpdated={onUpdated} onLabelUpdated={onLabelUpdated} />,
        );
      });

      await act(async () => {
        labelSpan().click();
      });
      await act(async () => {
        labelSpan().click();
      });

      const input = labelInput() as HTMLInputElement;
      await act(async () => {
        setFieldValue(input, "Renamed");
      });
      await act(async () => {
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      });

      expect(setCardLabel).toHaveBeenCalledWith("c1", { label: "Renamed" }, messages);
      expect(onLabelUpdated).toHaveBeenCalledWith({ ...card, label: "Renamed" });
      expect(labelInput()).toBeNull();
    });

    it("Enter with unchanged text is a silent no-op, no PATCH call", async () => {
      await act(async () => {
        root.render(
          <CardRoutingControl card={card} lists={lists} messages={messages} onUpdated={onUpdated} onLabelUpdated={onLabelUpdated} />,
        );
      });

      await act(async () => {
        labelSpan().click();
      });
      await act(async () => {
        labelSpan().click();
      });
      const input = labelInput() as HTMLInputElement;
      await act(async () => {
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      });

      expect(setCardLabel).not.toHaveBeenCalled();
      expect(labelInput()).toBeNull();
    });

    it("Enter with an empty draft shows an inline error and stays in editing, no PATCH call", async () => {
      await act(async () => {
        root.render(
          <CardRoutingControl card={card} lists={lists} messages={messages} onUpdated={onUpdated} onLabelUpdated={onLabelUpdated} />,
        );
      });

      await act(async () => {
        labelSpan().click();
      });
      await act(async () => {
        labelSpan().click();
      });
      const input = labelInput() as HTMLInputElement;
      await act(async () => {
        setFieldValue(input, "   ");
      });
      await act(async () => {
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      });

      expect(setCardLabel).not.toHaveBeenCalled();
      expect(container.querySelector('[role="alert"]')?.textContent).toBe(messages.errorInvalidLabel);
      expect(labelInput()).not.toBeNull();
    });

    it("Escape discards the draft and returns to idle with no PATCH call", async () => {
      await act(async () => {
        root.render(
          <CardRoutingControl card={card} lists={lists} messages={messages} onUpdated={onUpdated} onLabelUpdated={onLabelUpdated} />,
        );
      });

      await act(async () => {
        labelSpan().click();
      });
      await act(async () => {
        labelSpan().click();
      });
      const input = labelInput() as HTMLInputElement;
      await act(async () => {
        setFieldValue(input, "Changed");
      });
      await act(async () => {
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      });

      expect(setCardLabel).not.toHaveBeenCalled();
      expect(labelInput()).toBeNull();
      expect(container.textContent).toContain("My Visa");
    });

    it("outside pointerdown while primed reverts to idle before any input mounts", async () => {
      await act(async () => {
        root.render(
          <CardRoutingControl card={card} lists={lists} messages={messages} onUpdated={onUpdated} onLabelUpdated={onLabelUpdated} />,
        );
      });

      await act(async () => {
        labelSpan().click();
      });
      await act(async () => {
        document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      });
      await act(async () => {
        labelSpan().click();
      });

      // If the prime had not been cancelled, this single click would land in
      // "editing" (second click of the original prime) and mount an input.
      expect(labelInput()).toBeNull();
    });

    it("outside pointerdown while editing discards the draft like Escape", async () => {
      await act(async () => {
        root.render(
          <CardRoutingControl card={card} lists={lists} messages={messages} onUpdated={onUpdated} onLabelUpdated={onLabelUpdated} />,
        );
      });

      await act(async () => {
        labelSpan().click();
      });
      await act(async () => {
        labelSpan().click();
      });
      const input = labelInput() as HTMLInputElement;
      await act(async () => {
        setFieldValue(input, "Changed");
      });
      await act(async () => {
        document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      });

      expect(setCardLabel).not.toHaveBeenCalled();
      expect(labelInput()).toBeNull();
      expect(container.textContent).toContain("My Visa");
    });

    it("a server card_not_found error shows inline and stays in editing", async () => {
      setCardLabel.mockResolvedValue({ ok: false, error: messages.errorCardNotFound });

      await act(async () => {
        root.render(
          <CardRoutingControl card={card} lists={lists} messages={messages} onUpdated={onUpdated} onLabelUpdated={onLabelUpdated} />,
        );
      });

      await act(async () => {
        labelSpan().click();
      });
      await act(async () => {
        labelSpan().click();
      });
      const input = labelInput() as HTMLInputElement;
      await act(async () => {
        setFieldValue(input, "Renamed");
      });
      await act(async () => {
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      });

      expect(container.querySelector('[role="alert"]')?.textContent).toBe(messages.errorCardNotFound);
      expect(labelInput()).not.toBeNull();
    });
  });
});
