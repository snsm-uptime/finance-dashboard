# Bank statement parsing — agent setup

How to run a technical brainstorm, per bank, for extending statement parsing —
and the order to do it in. This project supports a limited, known set of
banks; each one gets brainstormed against real example documents rather than
guessed at generically.

## Why this exists

Story 4.4 shipped the abstract adapter contract (`BankAdapter` protocol,
`CanonicalLine`, `domain/line_types.py`, `domain/canonical_line.py`) and one
concrete adapter (`adapters/bank/bac_credit/`) proving it against a
hand-authored synthetic fixture. Testing the recon tool
(`api/scripts/statement_recon.py`) against real BAC statements afterward
surfaced structure the contract doesn't yet treat as first-class:

- **Two-level headers** — a real section title immediately followed by a
  column sub-header (e.g. `B) Detalle de compras del periodo` then
  `colones dólares`) — currently handled ad hoc per adapter, not in the
  contract.
- **Per-product date-format variance** — BAC credit cards print
  `DD-MMM-YY`; BAC debit accounts print `MMM/DD` with no year. Different
  products from the *same bank* need different date parsers.
- **Statement-boundary detection** — a printed page counter (`Página X de
  Y`) resetting to 1 is reliable evidence of a new statement; a repeating
  page header is not (it's just a running title). The contract doesn't yet
  say which signal an adapter should prefer.

Each new bank (Promerica next, per Story 4.5's stub) will surface its own
variants of these problems. Rather than re-litigating the abstract design
inside every story, do the design thinking once per bank, up front, grounded
in real examples — then implementation is mechanical.

## Real example material already available

- `bank_data/` at the repo root (gitignored, local-only) — real BAC
  statements across products (credit `ECO`/`WALMART`, debit
  `COLONES`/`DOLARES`), one per month. Never commit these.
- `api/scripts/statement_recon.py` — run it against any file in `bank_data/`
  to get a structure map (`mapping.yaml`: section headers, column positions,
  row counts, dual-column presence, statement-boundary method) and an
  anonymized mock PDF safe to use as a test fixture. See
  `api/scripts/README.md` for full usage and the PII-review caveat
  (`header_lines`/`statement_marker` are real text — review before
  committing any mapping you generate).

## The order

Do these in sequence — step 2 depends on step 1 existing to reference.

### 1. Design session with the architect (Winston)

Talk to `bmad-agent-architect` directly (ask for Winston, or the architect).
This is a focused conversation, not the full `bmad-architecture` workflow —
only escalate to that if the outcome turns out to be spine-worthy (changes
an existing AD, not just extends the adapter contract).

**Bring to the session:**
- The existing contract: `api/domain/canonical_line.py`,
  `api/application/bank_adapters.py`, `api/adapters/bank/bac_credit/adapter.py`
- One or more `mapping.yaml` outputs from `statement_recon.py` run against
  real files in `bank_data/` (structure only, no PII — safe to bring as-is)
- The three gaps above (two-level headers, per-product date formats,
  statement-boundary detection)

**Goal:** an abstract Python design — Protocols, enums, dataclasses — that
generalizes these patterns so a new bank/product adapter implements them by
filling in a contract, not by inventing per-adapter special cases. Output
lands under `_bmad-output/planning-artifacts/architecture/` (exact path
depends on how the session runs — check there after).

### 2. Write the brainstorm playbook (tech writer — Paige)

Invoke `bmad-agent-tech-writer` with the **Write Document** action (ask
Paige, or use the `WD` menu code). This produces the actual "documentation
for an agent" — a playbook that:

- Explains the repeatable process: locate real examples in `bank_data/`,
  run `statement_recon.py`, review the resulting `mapping.yaml` against the
  new bank's actual layout, identify which parts of the abstract contract
  from step 1 apply directly vs. need a new implementation.
- **Explicitly references and explains step 1's output** — link to the
  architecture doc/addendum, and walk through how each Protocol/enum/class
  maps to a concrete decision an adapter author has to make (e.g. "which
  date-format enum value does this bank's statement need").
- Is written so that whichever agent facilitates a future per-bank
  brainstorm session can load it as grounding context, not so a human has
  to re-explain the contract from scratch each time.

### 3. (Optional) Wire it as persistent context

If you want the playbook auto-loaded every time a brainstorm session starts,
rather than pasting it in manually: use `bmad-customize` to add it as a
persistent fact on whichever agent/persona will run these sessions (Winston,
or a custom persona via party mode if you want a dedicated "bank statement
parsing" personality).

## Per-bank brainstorm loop (once the above exists)

For each new bank/product:

1. Get a real statement into `bank_data/` (never committed).
2. `uv run python scripts/statement_recon.py bank_data/<file>.pdf --bank <id>`
   from `api/`.
3. Review `mapping.yaml` against the actual PDF — confirm section headers,
   date format, dual-column presence, statement-boundary method are all
   correctly detected (the tool is heuristic; verify, don't trust blindly).
4. Bring the reviewed mapping + the playbook (step 2 above) into a
   brainstorm session to decide how this bank's adapter should be built
   against the abstract contract (step 1 above).
5. Implement via a normal story (`bmad-create-story` → `bmad-dev-story`),
   same as Story 4.4/4.5.
