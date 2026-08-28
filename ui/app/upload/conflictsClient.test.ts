/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { routeAfterImportLanding } from "./conflictsClient";

describe("routeAfterImportLanding", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("routes to the list when the conflict queue is empty", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ conflicts: [] }),
    });
    const push = vi.fn();

    await routeAfterImportLanding({ push }, "list-1");

    expect(push).toHaveBeenCalledWith("/lists/list-1");
  });

  it("routes to /lists when there is no landing list and the queue is empty", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ conflicts: [] }),
    });
    const push = vi.fn();

    await routeAfterImportLanding({ push }, null);

    expect(push).toHaveBeenCalledWith("/lists");
  });

  it("routes to conflict review instead of the list when the queue is non-empty", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        conflicts: [
          {
            id: "c1",
            manual: {
              entry_id: "m1",
              list_id: "list-1",
              list_name: "Groceries",
              amount: "10.00",
              currency: "CRC",
              normalized_description: "Manual",
              posted_date: "2026-08-10",
            },
            parsed: {
              entry_id: "p1",
              list_id: "list-1",
              list_name: "Groceries",
              amount: "10.00",
              currency: "CRC",
              normalized_description: "Parsed",
              posted_date: "2026-08-10",
            },
            detected_at: "2026-08-10T00:00:00Z",
          },
        ],
      }),
    });
    const push = vi.fn();

    await routeAfterImportLanding({ push }, "list-1");

    expect(push).toHaveBeenCalledWith("/upload/conflicts?landingListId=list-1");
  });

  it("routes to the landing list, not conflict review, when the queue's only conflict touches an unrelated list", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        conflicts: [
          {
            id: "c1",
            manual: {
              entry_id: "m1",
              list_id: "other-list",
              list_name: "Unrelated",
              amount: "10.00",
              currency: "CRC",
              normalized_description: "Manual",
              posted_date: "2026-08-10",
            },
            parsed: {
              entry_id: "p1",
              list_id: "other-list",
              list_name: "Unrelated",
              amount: "10.00",
              currency: "CRC",
              normalized_description: "Parsed",
              posted_date: "2026-08-10",
            },
            detected_at: "2026-08-10T00:00:00Z",
          },
        ],
      }),
    });
    const push = vi.fn();

    await routeAfterImportLanding({ push }, "list-1");

    expect(push).toHaveBeenCalledWith("/lists/list-1");
  });

  it("fails open to the list when the queue check errors", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    const push = vi.fn();

    await routeAfterImportLanding({ push }, "list-1");

    expect(push).toHaveBeenCalledWith("/lists/list-1");
  });
});
