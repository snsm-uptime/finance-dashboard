/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DefaultImportListControl } from "./DefaultImportListControl";
import { cardsMessages } from "@/lib/i18n/cards";
import type { ListItem } from "../lists/listsClient";

const setDefaultImportList = vi.fn();

vi.mock("../lists/listsClient", async () => {
  const actual = await vi.importActual<typeof import("../lists/listsClient")>(
    "../lists/listsClient",
  );
  return {
    ...actual,
    setDefaultImportList: (...args: unknown[]) => setDefaultImportList(...args),
  };
});

const messages = {
  defaultListTitle: cardsMessages.en.defaultListTitle,
  defaultListHint: cardsMessages.en.defaultListHint,
  errorGeneric: cardsMessages.en.errorGeneric,
  errorUnauthorized: cardsMessages.en.errorUnauthorized,
  errorForbidden: cardsMessages.en.errorForbidden,
};

const lists: ListItem[] = [
  { id: "list-1", name: "Household", owner_id: "u1", role: "owner" },
  { id: "list-2", name: "Trip", owner_id: "u1", role: "owner" },
];

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

describe("DefaultImportListControl", () => {
  let container: HTMLDivElement;
  let root: Root;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    setDefaultImportList.mockReset();
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ default_import_list_id: "list-1" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
  });

  it("renders the current default read from /api/auth/me", async () => {
    await act(async () => {
      root.render(<DefaultImportListControl lists={lists} messages={messages} />);
    });
    // Flush the /api/auth/me fetch effect.
    await act(async () => {
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/me",
      expect.objectContaining({ credentials: "same-origin" }),
    );
    const trigger = container.querySelector('button[aria-haspopup="listbox"]') as HTMLButtonElement;
    expect(trigger.textContent).toBe("Household");
  });

  it("changing the select fires setDefaultImportList immediately", async () => {
    setDefaultImportList.mockResolvedValue({ ok: true });

    await act(async () => {
      root.render(<DefaultImportListControl lists={lists} messages={messages} />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    await chooseListOption(container, "Trip");

    expect(setDefaultImportList).toHaveBeenCalledWith(
      "list-2",
      expect.objectContaining({ errorForbidden: messages.errorForbidden }),
    );
  });

  it("a failed save surfaces an inline error", async () => {
    setDefaultImportList.mockResolvedValue({ ok: false, error: messages.errorForbidden });

    await act(async () => {
      root.render(<DefaultImportListControl lists={lists} messages={messages} />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    await chooseListOption(container, "Trip");

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(messages.errorForbidden);
  });
});
