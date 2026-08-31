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

  it("returns null (All periods) when no period is requested, even with cycles available", () => {
    expect(resolveSelectedPeriod(cyclesPayload, undefined)).toBeNull();
  });

  it("returns null (All periods) when the requested statement id is unknown", () => {
    expect(resolveSelectedPeriod(cyclesPayload, "stale-statement")).toBeNull();
  });

  it("returns null (All periods) when there are no cycles, ignoring the calendar-month fallback", () => {
    const empty = {
      cycles: [],
      default_statement_id: null,
      fallback_period: { start: "2026-08-01", end: "2026-08-31" },
    };
    expect(resolveSelectedPeriod(empty, undefined)).toBeNull();
  });

  it("returns null when nothing is resolvable — caller omits period params", () => {
    const nothing = { cycles: [], default_statement_id: null, fallback_period: null };
    expect(resolveSelectedPeriod(nothing, undefined)).toBeNull();
  });
});
