import { describe, expect, it } from "vitest";

import { asOriginSpend, originCardsPropsFrom } from "./page";

const messages = {
  cyclePeriodOptionUnknownCard: "Card",
  expenseOriginCash: "Cash",
  expenseOriginBlank: "None",
};

describe("asOriginSpend", () => {
  it("parses well-formed origins", () => {
    expect(
      asOriginSpend({
        origins: [
          { kind: "card", card_id: "c1", card_label: "BAC Visa", total_crc: "100.00" },
          { kind: "cash", card_id: null, card_label: null, total_crc: "20.00" },
        ],
      }),
    ).toEqual({
      origins: [
        { kind: "card", card_id: "c1", card_label: "BAC Visa", total_crc: "100.00" },
        { kind: "cash", card_id: null, card_label: null, total_crc: "20.00" },
      ],
    });
  });

  it("drops malformed rows, keeping well-formed ones", () => {
    expect(
      asOriginSpend({
        origins: [
          { kind: "card", card_id: "c1", card_label: "BAC Visa", total_crc: "100.00" },
          { kind: "unknown", total_crc: "5.00" },
          { kind: "cash", total_crc: 5 },
          { bad: true },
        ],
      }).origins,
    ).toEqual([{ kind: "card", card_id: "c1", card_label: "BAC Visa", total_crc: "100.00" }]);
  });

  it("defaults a non-string card_label to null instead of dropping the row", () => {
    expect(
      asOriginSpend({
        origins: [{ kind: "card", card_id: "c1", card_label: 12345, total_crc: "100.00" }],
      }).origins,
    ).toEqual([{ kind: "card", card_id: "c1", card_label: null, total_crc: "100.00" }]);
  });

  it("defaults absent card_id/card_label to null", () => {
    expect(asOriginSpend({ origins: [{ kind: "blank", total_crc: "5.00" }] }).origins).toEqual([
      { kind: "blank", card_id: null, card_label: null, total_crc: "5.00" },
    ]);
  });

  it("never fabricates data for absent/malformed payloads", () => {
    expect(asOriginSpend(null)).toEqual({ origins: [] });
    expect(asOriginSpend({})).toEqual({ origins: [] });
    expect(asOriginSpend({ origins: "nope" })).toEqual({ origins: [] });
  });
});

describe("originCardsPropsFrom", () => {
  it("maps a card origin's label to its card_label", () => {
    expect(
      originCardsPropsFrom(
        { origins: [{ kind: "card", card_id: "c1", card_label: "BAC Visa", total_crc: "100.00" }] },
        messages,
      ),
    ).toEqual([{ kind: "card", label: "BAC Visa", amountCrc: "₡100", isNegative: false }]);
  });

  it("falls back to the unknown-card label when card_label is missing", () => {
    expect(
      originCardsPropsFrom(
        { origins: [{ kind: "card", card_id: "c1", card_label: null, total_crc: "40.00" }] },
        messages,
      ),
    ).toEqual([{ kind: "card", label: "Card", amountCrc: "₡40", isNegative: false }]);
  });

  it("maps cash and blank kinds to their message keys", () => {
    expect(
      originCardsPropsFrom(
        {
          origins: [
            { kind: "cash", card_id: null, card_label: null, total_crc: "20.00" },
            { kind: "blank", card_id: null, card_label: null, total_crc: "5.00" },
          ],
        },
        messages,
      ),
    ).toEqual([
      { kind: "cash", label: "Cash", amountCrc: "₡20", isNegative: false },
      { kind: "blank", label: "None", amountCrc: "₡5", isNegative: false },
    ]);
  });

  it("shows a full-offset zero total as non-negative", () => {
    expect(
      originCardsPropsFrom(
        { origins: [{ kind: "cash", card_id: null, card_label: null, total_crc: "0" }] },
        messages,
      ),
    ).toEqual([{ kind: "cash", label: "Cash", amountCrc: "₡0", isNegative: false }]);
  });

  it("formats a negative total with an explicit leading sign and isNegative=true (Story 6.2 review)", () => {
    expect(
      originCardsPropsFrom(
        { origins: [{ kind: "card", card_id: "c1", card_label: "BAC Visa", total_crc: "-30.00" }] },
        messages,
      ),
    ).toEqual([{ kind: "card", label: "BAC Visa", amountCrc: "-₡30", isNegative: true }]);
  });

  it("returns an empty array for an empty payload", () => {
    expect(originCardsPropsFrom({ origins: [] }, messages)).toEqual([]);
  });
});
