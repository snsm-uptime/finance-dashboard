# Adversarial Review — AD-28 (Real-text row recognition + amount-column role)

**Scope:** `ARCHITECTURE-SPINE.md`, section "AD-28 — Real-text row recognition + amount-column role"
(lines 263–271), read against the sections it extends (AD-1, AD-16, AD-25, AD-26, AD-27) and against
the current implementation it is meant to generalize (`api/scripts/statement_recon.py`,
`api/domain/statement_layout.py`, `api/adapters/bank/bac_credit/adapter.py`).

**Lens:** construct two units one level down (two independent bank-adapter implementers) that each
obey AD-28's Rule text to the letter yet build incompatibly — clashing shared-data shapes, two owners
of one entity, conflicting state-mutation paths. Every incompatible pair is a hole to close with a new
or tightened AD.

## Verdict

AD-28 is well-evidenced (its claims about the existing code check out — see the companion
`review-version-reality-ad28.md`) but **under-specified as a contract** in four places where the Rule
text permits two literal-compliant implementations to diverge and produce silently different
behavior or incompatible data shapes on the same input. The most serious hole is structural: AD-28
declares `AmountColumnRole` as a *product-level* fact, disconnected from AD-25's `SectionSpec` /
`column_header`, even though the column layout AD-28 needs to resolve (DÉBITOS/CRÉDITOS) is the exact
same physical artifact AD-25 already models as section-scoped text. That is a genuine "two owners of
one entity" gap, not just a phrasing nit.

## Findings

### 1. (High) No per-product declared vocabulary for "amount-shaped token" — AD-28 breaks its own precedent from AD-26

AD-26 explicitly gives each product a **declared** token vocabulary for dates (`date_format`, e.g.
`"%d-%b-%y"` vs `"%b/%d"`), resolved by a shared tokenizer against that declaration. AD-28 does the
opposite for amounts: it hardcodes one universal regex-shaped concept ("amount-shaped token"), pinned
only by a pointer to `api/scripts/statement_recon.py`'s `_amount_tokens` (`_AMOUNT_RE =
r"\b\d{1,3}(?:,\d{3})*\.\d{2}\b"` — US-style thousands comma, exactly two decimal digits, no sign, no
parens, no `₡`/`$` glyph) — and the Rule's own validation claim is scoped to "two real BAC statements,"
i.e. one number-formatting convention.

**Incompatible pair:** A third adapter (e.g. a bank whose amounts print as `₡1.234,56` decimal-comma,
or `(1,234.56)` for debits) forces a real choice AD-28 never adjudicates. Implementer A hardwires a
second pattern branch into the "shared" `domain/statement_row_extraction.py` classifier so it now
silently matches two incompatible formats with no declared owner per adapter — the exact "ad-hoc
per-adapter amount-column semantics" AD-28's own Prevents clause disclaims, just moved from the
column-role layer to the token-shape layer. Implementer B, reading the Rule literally ("adapters MUST
use this shared classifier, not a private line-format assumption"), does not touch the shared
classifier and instead accepts that their bank's data rows classify as non-rows — reintroducing,
faithfully and "compliantly," the exact silent-zero-rows failure mode AD-28 was written to prevent.
Both are literal-compliant; the spine gives no third option (a declared `amount_format`/token
vocabulary per product, mirroring AD-26) that would have forced a single correct answer.

### 2. (High) `SIGN_VARIANT` "nearest declared range" leaves the distance metric unspecified, and validates only the empty case

The Rule says outcomes resolve by "nearest declared range, not exact containment," and separately says
declaring `SIGN_VARIANT` with **no** matching ranges "MUST raise at adapter construction/test time."
Two gaps compound:

- **Distance metric.** "Nearest" is not defined as nearest-bound distance vs. nearest-midpoint
  distance. The Rule's own justification for "nearest" is that "real x-ranges drift page-to-page
  within one document (observed directly... different ranges for the same declared section on page 2
  vs. page 3)" — i.e., the very case the Rule exists for is exactly the case where declared ranges can
  be unequal width or asymmetric relative to a boundary token. For two implementers who each write the
  shared resolver, a bounds-distance metric (`min(|x - x0|, |x - x1|)`, 0 if inside) and a
  midpoint-distance metric (`|x - (x0+x1)/2|`) agree everywhere except near an asymmetric or
  unequal-width boundary — which is precisely the drifted-range scenario AD-28 cites as its own
  motivating evidence. A token at the boundary between a narrow DÉBITOS range and a wide CRÉDITOS
  range can resolve to opposite `line_type`s (opposite sign) under the two metrics, on identical input,
  with no test in either implementer's own suite catching it (each is internally consistent).
- **Validation scope.** "Fail loud... MUST raise" is written only for the *zero-ranges* case
  (`SIGN_VARIANT` declared, no ranges declared at all). It says nothing about malformed-but-nonempty
  declarations: overlapping ranges, a gap between ranges with no coverage, only one range declared for
  a two-outcome product, or two ranges bound to the same `line_type`. Two implementers again diverge
  legitimately: A adds construction-time validation that ranges are non-overlapping, contiguous or
  explicitly gapped, and 1:1 with outcomes (going beyond the letter of the Rule); B implements only
  what's written (raise iff ranges list is empty) and ships a resolver that will silently pick *some*
  range for a token that falls in an undeclared gap or an overlap, because "nearest" always returns an
  answer even when the declaration itself is incoherent.

### 3. (Medium) "Fail loud... at adapter construction/test time" doesn't pin a required, always-reachable check

The disjunction "construction/test time" is satisfiable by two structurally different implementations:
Implementer A raises inside the adapter's `__init__`/construction path, so any code that instantiates
the adapter (app startup, CI, ad-hoc script) fails immediately, unconditionally. Implementer B
satisfies "test time" with a `validate()` method that is never called from `__init__` and is only
exercised by whichever golden/fixture test (AD-11) happens to invoke it — a check that exists, and
would fail *if run*, but is not structurally guaranteed to run for every adapter (nothing in AD-28
mandates a central adapter registry with an enforced "construct + validate every declared adapter"
CI gate, unlike AD-19's explicit "membership checks enforced in one application-layer path" pattern).
Under B's reading, a malformed `SIGN_VARIANT` adapter that isn't wired into that specific test can be
constructed and reach `parse()` with an incoherent range declaration — the exact "runtime surprise
mid-`parse()`" the clause says it's preventing. Both A and B can honestly claim their code "raises at
adapter construction/test time."

### 4. (High — structural) `AmountColumnRole` has no declared owner relative to AD-25's `SectionSpec`, and the two ADs model the same physical artifact independently

AD-25's `SectionSpec` already carries an optional `column_header` field — the literal printed column
sub-header line (AD-28's own example: `"NO. REFERENCIA FECHA CONCEPTO DÉBITOS CRÉDITOS"`), which is
section-scoped by construction (`api/domain/statement_layout.py:28-40` confirms `column_header: str |
None` lives on `SectionSpec`, one per declared section). AD-28 then separately declares
`AmountColumnRole` and its x-position ranges at the **product** level, explicitly "not per-`SectionSpec`,
since the real evidence shows this doesn't vary section-to-section within a product" — i.e., AD-28
asserts a fact about *today's* two BAC products and encodes it as an architectural constraint that
structurally cannot express a product where it does vary (e.g., one section with a genuine
DÉBITOS/CRÉDITOS `SIGN_VARIANT` layout and another section in the same statement with a
dual-currency `CURRENCY_VARIANT` layout — plausible for a combined transactions + interest-charges
statement).

**Incompatible pair:** Implementer A, building such a bank, correctly needs per-section role info and
adds an `amount_column_role` field onto `SectionSpec` itself (a natural place, since the column layout
is literally the thing `column_header` already names) — diverging from AD-28's "declares once per
product" text. Implementer B follows AD-28 literally, declares one product-level `AmountColumnRole`,
and gets systematically wrong signs/line_types for whichever section doesn't match the declared role,
silently (no error — the resolver always returns *some* nearest range). Even absent that scenario,
today's two ADs each own half of "where do this statement's columns come from" — AD-25 owns the
column *header text*, AD-28 owns the column *x-position semantics* — with no cross-reference between
them and no combined struct. A generic tool or future adapter trying to introspect "all column
information for section X" has to know to look in two unrelated places, and nothing prevents a future
AD-29-style addition from re-declaring column geometry a third way.

## Non-findings worth noting

- The `pdfplumber`-primitives boundary ("adapter's job... domain classifies/resolves on primitives
  only, never imports `pdfplumber`") is clean against AD-1's forbidden list (`domain →
  ...pdfplumber...`) and against AD-16 — no clash found there.
- The literal row-detection composition against AD-25's `SectionCursor` (does the date+amount
  classifier gate *before* `SectionCursor.see_header_line`/`classify_data_row`, or run as an
  independent/secondary check?) is *not* pinned normatively by AD-28's Rule text, but the existing
  `bac_credit` adapter's control flow (`api/adapters/bank/bac_credit/adapter.py:149-167`) makes the
  "classifier gates routing, then `SectionCursor` maps ignored/unmapped/data" order look like settled
  precedent. Flagged here only as a lower-confidence fifth candidate: since AD-28 doesn't state this
  ordering as an invariant (only the current, soon-to-be-replaced `"|" in line` code implies it), a new
  adapter author who reads only the spine (not that file) could still choose a different composition
  without contradicting the Rule text. Not elevated to a numbered finding because the divergence risk
  is smaller than 1–4 and the existing code gives real (if silent) guidance.

## Recommendation shape (not prescriptive text)

- Give amount-token shape a declared, per-product vocabulary analogous to AD-26's `date_format`,
  rather than one hardcoded regex validated against a single bank's two products.
- Pin the `SIGN_VARIANT` distance metric explicitly (bounds-distance vs. midpoint-distance), and extend
  the "fail loud" clause to cover malformed-but-nonempty range declarations (overlap, gaps, count
  mismatch vs. outcome set), not only the zero-ranges case.
- State the fail-loud check as reachable unconditionally (e.g., "MUST raise from `__init__`," not
  "construction/test time"), or explicitly mandate a central registry-driven CI gate the way AD-19
  mandates one enforcement path for membership.
- Resolve the `SectionSpec` vs. `AmountColumnRole` ownership split: either fold column-role/ranges into
  `SectionSpec` (section-scoped, with a product-level default when it truly doesn't vary) or explicitly
  state that `column_header` and `AmountColumnRole` are deliberately independent concepts and say why a
  future per-section override is out of scope rather than silently unsupported.
