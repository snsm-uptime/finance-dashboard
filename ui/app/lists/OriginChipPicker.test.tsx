/** @vitest-environment jsdom */

import { act } from "react";
import type { ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { listsMessages } from "@/lib/i18n/lists";

import { OriginChipPicker, originOptionsFrom } from "./OriginChipPicker";
import type { CardItem } from "../cards/cardsClient";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

const fetchCards = vi.fn();
vi.mock("../cards/cardsClient", () => ({
  fetchCards: (...args: unknown[]) => fetchCards(...args),
}));

const updateExpenseOrigin = vi.fn();
vi.mock("./listsClient", async () => {
  const actual = await vi.importActual<typeof import("./listsClient")>("./listsClient");
  return {
    ...actual,
    updateExpenseOrigin: (...args: unknown[]) => updateExpenseOrigin(...args),
  };
});

const messages = {
  expenseOriginNone: listsMessages.en.expenseOriginNone,
  expenseOriginCash: listsMessages.en.expenseOriginCash,
  expenseOriginLabel: listsMessages.en.expenseOriginLabel,
  errorGeneric: listsMessages.en.errorGeneric,
  errorInvalidName: listsMessages.en.errorInvalidName,
  errorForbidden: listsMessages.en.errorForbidden,
  errorUnauthorized: listsMessages.en.errorUnauthorized,
};

function card(overrides: Partial<CardItem> = {}): CardItem {
  return {
    id: "card-1",
    label: "My Visa",
    iban: "CR05",
    created_at: "2026-08-06T12:00:00Z",
    routing_mode: "review",
    fixed_list_id: null,
    ...overrides,
  };
}

function renderPicker(
  root: Root,
  overrides: Partial<ComponentProps<typeof OriginChipPicker>> = {},
) {
  root.render(
    <OriginChipPicker
      listId="list-1"
      entryId="e1"
      originKind={null}
      originCardId={null}
      originLabel={messages.expenseOriginNone}
      originTone="warning"
      messages={messages}
      title="Coffee"
      when="2026-08-06"
      amount="₡10"
      {...overrides}
    />,
  );
}

describe("originOptionsFrom", () => {
  const cards = [card(), card({ id: "card-2", label: "Kitchen" })];

  it("blank origin lists Cash plus all cards, omitting No Origin", () => {
    expect(originOptionsFrom(cards, { kind: null, cardId: null }, "Cash", "No Origin")).toEqual([
      { value: "cash", label: "Cash" },
      { value: "card-1", label: "My Visa" },
      { value: "card-2", label: "Kitchen" },
    ]);
  });

  it("omits Cash when current is cash and lists No Origin plus cards", () => {
    expect(originOptionsFrom(cards, { kind: "cash", cardId: null }, "Cash", "No Origin")).toEqual([
      { value: "", label: "No Origin", tone: "warning" },
      { value: "card-1", label: "My Visa" },
      { value: "card-2", label: "Kitchen" },
    ]);
  });

  it("omits the current card and keeps No Origin, Cash, and others", () => {
    expect(
      originOptionsFrom(cards, { kind: "card", cardId: "card-1" }, "Cash", "No Origin"),
    ).toEqual([
      { value: "", label: "No Origin", tone: "warning" },
      { value: "cash", label: "Cash" },
      { value: "card-2", label: "Kitchen" },
    ]);
  });

  it("is No Origin only when current is cash and there are no cards", () => {
    expect(originOptionsFrom([], { kind: "cash", cardId: null }, "Cash", "No Origin")).toEqual([
      { value: "", label: "No Origin", tone: "warning" },
    ]);
  });
});

describe("OriginChipPicker", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    refresh.mockReset();
    fetchCards.mockReset();
    fetchCards.mockResolvedValue({ ok: true, cards: [card(), card({ id: "card-2", label: "Kitchen" })] });
    updateExpenseOrigin.mockReset();
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

  it("opens a SlideDown of Cash plus cards from a No Origin chip", async () => {
    await act(async () => {
      renderPicker(root);
    });
    const trigger = container.querySelector("button[aria-expanded]") as HTMLButtonElement;
    expect(trigger.textContent).toContain(messages.expenseOriginNone);
    expect(trigger.className).toContain("text-owe");
    expect(container.querySelector("select")).toBeNull();

    await act(async () => {
      trigger.click();
    });

    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    const region = container.querySelector('[role="region"]') as HTMLElement;
    expect(region.getAttribute("aria-hidden")).toBe("false");
    const optionLabels = Array.from(region.querySelectorAll("button")).map((b) => b.textContent);
    expect(optionLabels).toEqual(["Cash", "My Visa", "Kitchen"]);
    expect(fetchCards).toHaveBeenCalledTimes(1);
  });

  it("keeps the accent alias inside the trigger while SlideDown is open", async () => {
    await act(async () => {
      renderPicker(root, { payerAlias: "sebas" });
    });
    const trigger = container.querySelector("button[aria-expanded]") as HTMLButtonElement;
    expect(trigger.querySelector(".text-accent")?.textContent).toContain("@sebas");
    expect(trigger.textContent).toContain(messages.expenseOriginNone);

    await act(async () => {
      trigger.click();
    });

    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(trigger.querySelector(".text-accent")?.textContent).toContain("@sebas");
    expect(trigger.textContent).toContain(messages.expenseOriginNone);
    for (const option of container.querySelectorAll('[role="region"] button')) {
      expect(option.textContent).not.toContain("@sebas");
    }
  });

  it("omits Cash from options when current origin is cash", async () => {
    await act(async () => {
      renderPicker(root, {
        originKind: "cash",
        originLabel: messages.expenseOriginCash,
        originTone: "muted",
      });
    });
    await act(async () => {
      (container.querySelector("button[aria-expanded]") as HTMLButtonElement).click();
    });
    const optionLabels = Array.from(
      container.querySelectorAll('[role="region"] button'),
    ).map((b) => b.textContent);
    expect(optionLabels).toEqual(["No Origin", "My Visa", "Kitchen"]);
  });

  it("omits the current card from options", async () => {
    await act(async () => {
      renderPicker(root, {
        originKind: "card",
        originCardId: "card-1",
        originLabel: "My Visa",
        originTone: "muted",
      });
    });
    await act(async () => {
      (container.querySelector("button[aria-expanded]") as HTMLButtonElement).click();
    });
    const optionLabels = Array.from(
      container.querySelectorAll('[role="region"] button'),
    ).map((b) => b.textContent);
    expect(optionLabels).toEqual(["No Origin", "Cash", "Kitchen"]);
  });

  it("PATCHes the chosen origin then refreshes", async () => {
    updateExpenseOrigin.mockResolvedValue({ ok: true, expense: { id: "e1" } });
    await act(async () => {
      renderPicker(root);
    });
    await act(async () => {
      (container.querySelector("button[aria-expanded]") as HTMLButtonElement).click();
    });
    await act(async () => {
      const cash = Array.from(container.querySelectorAll('[role="region"] button')).find(
        (b) => b.textContent === "Cash",
      ) as HTMLButtonElement;
      cash.click();
    });
    expect(updateExpenseOrigin).toHaveBeenCalledTimes(1);
    expect(updateExpenseOrigin).toHaveBeenCalledWith(
      "list-1",
      "e1",
      { origin_kind: "cash", origin_card_id: null },
      messages,
    );
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(container.querySelector("button[aria-expanded]")?.getAttribute("aria-expanded")).toBe(
      "false",
    );
    expect(container.querySelector("button[aria-expanded]")?.textContent).toContain("Cash");
  });

  it("PATCHes a card id then omits that card from a later open", async () => {
    updateExpenseOrigin.mockResolvedValue({ ok: true, expense: { id: "e1" } });
    await act(async () => {
      renderPicker(root);
    });
    await act(async () => {
      (container.querySelector("button[aria-expanded]") as HTMLButtonElement).click();
    });
    await act(async () => {
      const visa = Array.from(container.querySelectorAll('[role="region"] button')).find(
        (b) => b.textContent === "My Visa",
      ) as HTMLButtonElement;
      visa.click();
    });
    expect(updateExpenseOrigin).toHaveBeenCalledWith(
      "list-1",
      "e1",
      { origin_kind: "card", origin_card_id: "card-1" },
      messages,
    );
    await act(async () => {
      (container.querySelector("button[aria-expanded]") as HTMLButtonElement).click();
    });
    const optionLabels = Array.from(
      container.querySelectorAll('[role="region"] button'),
    ).map((b) => b.textContent);
    expect(optionLabels).toEqual(["No Origin", "Cash", "Kitchen"]);
  });

  it("dismisses on a second chip click without PATCHing", async () => {
    await act(async () => {
      renderPicker(root);
    });
    const trigger = container.querySelector("button[aria-expanded]") as HTMLButtonElement;
    await act(async () => {
      trigger.click();
    });
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    await act(async () => {
      trigger.click();
    });
    expect(updateExpenseOrigin).not.toHaveBeenCalled();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("dismisses on Escape without PATCHing", async () => {
    await act(async () => {
      renderPicker(root);
    });
    await act(async () => {
      (container.querySelector("button[aria-expanded]") as HTMLButtonElement).click();
    });
    await act(async () => {
      container.firstElementChild?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    expect(updateExpenseOrigin).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    expect(container.querySelector("button[aria-expanded]")?.getAttribute("aria-expanded")).toBe(
      "false",
    );
  });

  it("PATCHes null when choosing No Origin from a cash row", async () => {
    updateExpenseOrigin.mockResolvedValue({ ok: true, expense: { id: "e1" } });
    await act(async () => {
      renderPicker(root, {
        originKind: "cash",
        originLabel: messages.expenseOriginCash,
        originTone: "muted",
      });
    });
    await act(async () => {
      (container.querySelector("button[aria-expanded]") as HTMLButtonElement).click();
    });
    const none = Array.from(container.querySelectorAll('[role="region"] button')).find(
      (b) => b.textContent === messages.expenseOriginNone,
    ) as HTMLButtonElement;
    expect(none.className).toContain("text-owe");
    await act(async () => {
      none.click();
    });
    expect(updateExpenseOrigin).toHaveBeenCalledWith(
      "list-1",
      "e1",
      { origin_kind: null, origin_card_id: null },
      messages,
    );
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("stays open and shows an error when PATCH fails", async () => {
    updateExpenseOrigin.mockResolvedValue({ ok: false, error: "Nope" });
    await act(async () => {
      renderPicker(root);
    });
    await act(async () => {
      (container.querySelector("button[aria-expanded]") as HTMLButtonElement).click();
    });
    await act(async () => {
      const cash = Array.from(container.querySelectorAll('[role="region"] button')).find(
        (b) => b.textContent === "Cash",
      ) as HTMLButtonElement;
      cash.click();
    });
    expect(refresh).not.toHaveBeenCalled();
    expect(container.querySelector("button[aria-expanded]")?.getAttribute("aria-expanded")).toBe(
      "true",
    );
    expect(container.querySelector("[role='alert']")?.textContent).toBe("Nope");
  });

  it("opens with Cash and no invented cards when fetchCards fails", async () => {
    fetchCards.mockResolvedValue({ ok: false, error: "Cards down" });
    await act(async () => {
      renderPicker(root);
    });
    await act(async () => {
      (container.querySelector("button[aria-expanded]") as HTMLButtonElement).click();
    });
    expect(container.querySelector("button[aria-expanded]")?.getAttribute("aria-expanded")).toBe(
      "true",
    );
    const optionLabels = Array.from(
      container.querySelectorAll('[role="region"] button'),
    ).map((b) => b.textContent);
    expect(optionLabels).toEqual(["Cash"]);
    expect(container.querySelector("[role='alert']")?.textContent).toBe("Cards down");
  });

  it("retries fetchCards after a failed load on the next open", async () => {
    fetchCards
      .mockResolvedValueOnce({ ok: false, error: "Cards down" })
      .mockResolvedValueOnce({
        ok: true,
        cards: [card(), card({ id: "card-2", label: "Kitchen" })],
      });
    await act(async () => {
      renderPicker(root);
    });
    const trigger = container.querySelector("button[aria-expanded]") as HTMLButtonElement;
    await act(async () => {
      trigger.click();
    });
    expect(container.querySelector("[role='alert']")?.textContent).toBe("Cards down");
    await act(async () => {
      trigger.click();
    });
    await act(async () => {
      trigger.click();
    });
    expect(fetchCards).toHaveBeenCalledTimes(2);
    const optionLabels = Array.from(
      container.querySelectorAll('[role="region"] button'),
    ).map((b) => b.textContent);
    expect(optionLabels).toEqual(["Cash", "My Visa", "Kitchen"]);
  });

  it("opens cash rows with No Origin only when there are no cards", async () => {
    fetchCards.mockResolvedValue({ ok: true, cards: [] });
    await act(async () => {
      renderPicker(root, {
        originKind: "cash",
        originLabel: messages.expenseOriginCash,
        originTone: "muted",
      });
    });
    await act(async () => {
      (container.querySelector("button[aria-expanded]") as HTMLButtonElement).click();
    });
    const optionLabels = Array.from(
      container.querySelectorAll('[role="region"] button'),
    ).map((b) => b.textContent);
    expect(optionLabels).toEqual([messages.expenseOriginNone]);
    expect(container.querySelector("button[aria-expanded]")?.getAttribute("aria-expanded")).toBe(
      "true",
    );
  });

  it("shows Cash only when blank origin has no cards", async () => {
    fetchCards.mockResolvedValue({ ok: true, cards: [] });
    await act(async () => {
      renderPicker(root);
    });
    await act(async () => {
      (container.querySelector("button[aria-expanded]") as HTMLButtonElement).click();
    });
    const optionLabels = Array.from(
      container.querySelectorAll('[role="region"] button'),
    ).map((b) => b.textContent);
    expect(optionLabels).toEqual(["Cash"]);
  });
});
