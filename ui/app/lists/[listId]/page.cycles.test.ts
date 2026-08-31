import { describe, expect, it } from "vitest";

import { asCycles, resolveSelectedPeriod } from "./page";

describe("asCycles", () => {
  it("parses cycles, default_statement_id, and fallback_period", () => {
    expect(
      asCycles({
        cycles: [
          {
            statement_id: "s1",
            card_id: "c1",
            card_label: "BAC Visa",
            period_start: "2026-07-10",
            period_end: "2026-08-09",
          },
        ],
        default_statement_id: "s1",
        fallback_period: null,
      }),
    ).toEqual({
      cycles: [
        {
          statement_id: "s1",
          card_id: "c1",
          card_label: "BAC Visa",
          period_start: "2026-07-10",
          period_end: "2026-08-09",
        },
      ],
      default_statement_id: "s1",
      fallback_period: null,
    });
  });

  it("drops malformed cycle rows, keeping well-formed ones", () => {
    expect(
      asCycles({
        cycles: [
          { statement_id: "s1", period_start: "2026-07-10", period_end: "2026-08-09" },
          { bad: true },
          { statement_id: "s2", period_start: "2026-06-10" },
        ],
        default_statement_id: "s1",
        fallback_period: null,
      }).cycles,
    ).toEqual([
      {
        statement_id: "s1",
        card_id: null,
        card_label: null,
        period_start: "2026-07-10",
        period_end: "2026-08-09",
      },
    ]);
  });

  it("parses fallback_period when present", () => {
    expect(
      asCycles({ cycles: [], default_statement_id: null, fallback_period: { start: "2026-08-01", end: "2026-08-31" } }),
    ).toEqual({
      cycles: [],
      default_statement_id: null,
      fallback_period: { start: "2026-08-01", end: "2026-08-31" },
    });
  });

  it("never fabricates data for absent/malformed payloads", () => {
    expect(asCycles(null)).toEqual({ cycles: [], default_statement_id: null, fallback_period: null });
    expect(asCycles({})).toEqual({ cycles: [], default_statement_id: null, fallback_period: null });
    expect(asCycles({ cycles: "nope", fallback_period: "nope" })).toEqual({
      cycles: [],
      default_statement_id: null,
      fallback_period: null,
    });
  });
});

describe("resolveSelectedPeriod", () => {
  const cyclesPayload = {
    cycles: [
      { statement_id: "s-newer", card_id: null, card_label: null, period_start: "2026-07-10", period_end: "2026-08-09" },
      { statement_id: "s-older", card_id: null, card_label: null, period_start: "2026-06-10", period_end: "2026-07-09" },
    ],
    default_statement_id: "s-newer",
    fallback_period: null,
  };

  it("uses the requested statement id when it matches a known cycle", () => {
    expect(resolveSelectedPeriod(cyclesPayload, "s-older")).toEqual({
      period_start: "2026-06-10",
      period_end: "2026-07-09",
      selectedStatementId: "s-older",
    });
  });

  it("falls back to the default cycle when no period is requested", () => {
    expect(resolveSelectedPeriod(cyclesPayload, undefined)).toEqual({
      period_start: "2026-07-10",
      period_end: "2026-08-09",
      selectedStatementId: "s-newer",
    });
  });

  it("falls back to the default cycle when the requested statement id is unknown", () => {
    expect(resolveSelectedPeriod(cyclesPayload, "stale-statement")).toEqual({
      period_start: "2026-07-10",
      period_end: "2026-08-09",
      selectedStatementId: "s-newer",
    });
  });

  it("falls back to the calendar-month window when there are no cycles", () => {
    const empty = {
      cycles: [],
      default_statement_id: null,
      fallback_period: { start: "2026-08-01", end: "2026-08-31" },
    };
    expect(resolveSelectedPeriod(empty, undefined)).toEqual({
      period_start: "2026-08-01",
      period_end: "2026-08-31",
      selectedStatementId: null,
    });
  });

  it("returns null when nothing is resolvable — caller omits period params", () => {
    const nothing = { cycles: [], default_statement_id: null, fallback_period: null };
    expect(resolveSelectedPeriod(nothing, undefined)).toBeNull();
  });
});
