/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ParseComparisonPanel } from "./ParseComparisonPanel";
import type { StagedStatement } from "./uploadClient";

vi.mock("react-pdf", () => ({
  pdfjs: { GlobalWorkerOptions: { workerSrc: "" } },
  Document: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="pdf-document">{children}</div>
  ),
  Page: () => <div />,
}));

const statement: StagedStatement = {
  id: "st-failed",
  product_id: "promerica_stub",
  status: "failed",
  candidate_row_count: 0,
  iban: null,
  filename: "promerica_estado.pdf",
  card_id: null,
  rows: [],
  assigned_rows: [],
  zero_amount_excluded_count: 0,
  parse_evidence: {
    items: [
      {
        kind: "row",
        description: "COMERCIO GENERICO UNO",
        amount: "1000.00",
        currency: "CRC",
        posted_date: "2026-01-05",
      },
      { kind: "gap", raw_snippet: "07-ENE-26|COMERCIO GENERICO MALO|not-an-amount" },
    ],
  },
};

describe("ParseComparisonPanel", () => {
  let container: HTMLDivElement;
  let root: Root;

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  async function renderPanel(
    onContinue: () => void = () => undefined,
    fixture: StagedStatement = statement,
  ) {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(["%PDF"], { type: "application/pdf" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(
        <ParseComparisonPanel
          sessionId="s1"
          statement={fixture}
          locale="en"
          onContinue={onContinue}
        />,
      );
    });
    await act(async () => {
      await Promise.resolve();
    });
    return fetchMock;
  }

  it("labels extracted-items and PDF regions and loads the BFF PDF", async () => {
    const fetchMock = await renderPanel();
    expect(
      container.querySelector('[aria-label="Extracted items"]')?.getAttribute("role"),
    ).toBe("region");
    expect(
      container.querySelector('[aria-label="Original statement PDF"]')?.getAttribute("role"),
    ).toBe("region");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/import/sessions/s1/statements/st-failed/pdf",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("distinguishes gap rows from extracted amounts", async () => {
    await renderPanel();
    expect(container.textContent).toContain("Could not parse");
    expect(container.textContent).toContain("07-ENE-26|COMERCIO GENERICO MALO|not-an-amount");
    expect(container.textContent).toContain("COMERCIO GENERICO UNO");
    expect(container.textContent).toContain("CRC 1000.00");
  });

  it("Continue is visit-local and does not call discard or commit APIs", async () => {
    const onContinue = vi.fn();
    const fetchMock = await renderPanel(onContinue);
    const continueButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Continue",
    );
    await act(async () => {
      continueButton?.click();
    });
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls.every((call) => String(call[0]).includes("/pdf"))).toBe(true);
  });

  it("shows a visible gap empty-state when evidence items are missing", async () => {
    await renderPanel(() => undefined, { ...statement, parse_evidence: { items: [] } });
    expect(container.textContent).toContain("Could not parse");
    expect(container.textContent).toContain(
      "No extracted lines were saved for this statement. The original PDF is still below.",
    );
  });
});
