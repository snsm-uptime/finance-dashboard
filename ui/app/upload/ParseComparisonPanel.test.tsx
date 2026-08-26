/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ParseComparisonPanel } from "./ParseComparisonPanel";
import type { StagedStatement } from "./uploadClient";

vi.mock("react-pdf", () => ({
  pdfjs: { GlobalWorkerOptions: { workerSrc: "" } },
  Document: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
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
  });

  it("labels extracted-items and PDF regions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        blob: async () => new Blob(["%PDF"], { type: "application/pdf" }),
      }),
    );
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(
        <ParseComparisonPanel
          sessionId="s1"
          statement={statement}
          locale="en"
          onContinue={() => undefined}
        />,
      );
    });
    expect(
      container.querySelector('[aria-label="Extracted items"]')?.getAttribute("role"),
    ).toBe("region");
    expect(
      container.querySelector('[aria-label="Original statement PDF"]')?.getAttribute("role"),
    ).toBe("region");
  });
});
