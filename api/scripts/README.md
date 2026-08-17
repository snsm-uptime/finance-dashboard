# api/scripts

Dev-only tooling. Nothing here runs in production except `entrypoint.py`
(the container's `CMD`, launched via `python -m scripts.entrypoint` — not
meant to be run by hand).

Run everything from `api/`, with `uv run python scripts/<name>.py ...`.

## statement_recon.py — real statement → test mock + extraction mapping

**What it's for:** you have a real bank statement PDF and want (1) an
anonymized mock PDF safe to commit as a pytest fixture, and (2) a rough map
of the statement's structure (section headers, column positions, date/amount
shape) to jump-start writing a new `BankAdapter` (see `adapters/bank/`).

**How it works:** it reads the real PDF with `pdfplumber`, classifies each
line as a section-header candidate / transaction row / other, and attributes
each row to the full run of header lines seen since the last row (real
statements print multi-line/two-level headers — a section title immediately
followed by column sub-headers — so the whole run is kept, not just the
last line, to avoid silently discarding the real title). It then writes two
files into one output folder:

- `mapping.yaml` — structure only (section header lines, row counts, column
  x-position ranges, dual-column presence, page/statement counts). Sections
  are listed in document order and are **not** deduplicated by text — the
  same header text can legitimately appear in more than one entry if it
  labels different tables. No real amounts, dates, descriptions, account
  numbers, or names are ever written.
- `mock_statement.pdf` — a **freshly generated** synthetic PDF (same
  technique as `generate_bac_fixture.py`) built from the *shape* that was
  found — same section headers, same row counts, same dual-column pattern —
  populated with generic vocabulary and randomized values. It is not a
  redacted copy of the original file; nothing from the original is reused
  in it.

The real input file is only ever read. Its content is never copied,
uploaded, or embedded in either output — with one deliberate, flagged
exception, see **Security** below.

### Usage

```bash
cd api
uv run python scripts/statement_recon.py /path/to/real_statement.pdf
```

Full options:

```bash
uv run python scripts/statement_recon.py /path/to/real_statement.pdf \
    --bank promerica \
    --out-dir tests/fixtures/bank_recon/promerica \
    --seed 7
```

| Flag | Meaning | Default |
|---|---|---|
| *(positional)* | Path to the real statement PDF | required |
| `--bank` | Short id used for output naming and `mapping.yaml`'s `bank_id` (e.g. `bac`, `promerica`) | derived from the input filename |
| `--out-dir` | Where `mapping.yaml` + `mock_statement.pdf` are written | `tests/fixtures/bank_recon/<bank>/` |
| `--seed` | Random seed for the mock's synthetic values — same seed + input → identical mock every run | `42` |

`uv run python scripts/statement_recon.py --help` prints this from the CLI
itself.

`mapping.yaml`'s `statement_count_detected` is only as good as
`statement_count_method`:

- `page_counter` — reliable. A printed "Página X de Y" / "Page X of Y" page
  counter was found and resetting to 1 was used as the real statement
  boundary signal.
- `repeating_marker_guess` — a rough fallback used when no page counter was
  found: every occurrence of a repeating page header was treated as a new
  statement. This is frequently wrong when that header is just a running
  page title for one multi-page statement, not a per-statement marker —
  treat this count as a guess, not evidence.
- `no_evidence_assumed_single` — no page counter and no repeating header
  found; assumed to be one statement.

Exits `0` and prints a short summary (pages/sections/statements detected,
output paths) on success; exits `1` with a message on stderr if the file is
missing or unreadable.

### Security — review before committing output

`mapping.yaml`'s `statement_marker` and every section's `header_lines` are
**real text lifted verbatim from the source PDF** — this is intentional,
because a real bank's section vocabulary (e.g. `Detalle de compras`) is
exactly what a `BankAdapter` needs to be built against. Header detection is
best-effort and can occasionally misclassify a stray line (e.g. a name
printed alone) as a header. **Manually check those fields for personal data
before committing `mapping.yaml`.** Everything else in the mapping, and the
entire mock PDF, is synthetic — nothing else from the real file is echoed
anywhere.

The default output directory (`tests/fixtures/bank_recon/`) is gitignored,
so generated output is scratch by default. To promote a reviewed file into
a real, committed test fixture, `git add -f` it explicitly (and move it out
of `bank_recon/` into wherever that adapter's fixtures live, e.g.
`tests/fixtures/pdf/`).

### Where do I get a real statement to test with?

Local only, never committed: put real PDFs in `bank_data/` at the repo
root (already gitignored — see the top-level `.gitignore`). This project's
own dev history briefly had real BAC statements committed and later removed
from tracking; removal from a branch tip does **not** remove them from git
history, so if you need to recover them locally for testing:

```bash
git log --all --diff-filter=A --name-only --pretty=format: -- '*.pdf' | sort -u
git show <commit>:bank_data/<file>.pdf > bank_data/<file>.pdf
```

Never re-add real statement PDFs to git tracking.

## generate_bac_fixture.py — regenerate the BAC synthetic fixture

Rebuilds `tests/fixtures/pdf/bac_credit_synthetic.pdf`, the hand-authored
(not recon-derived) fixture `adapters/bank/bac_credit/`'s tests run against
(Story 4.4). Every value in it is invented from the PRD's BAC section map,
not derived from any real file.

```bash
uv run python scripts/generate_bac_fixture.py
```

Rerun it after changing the fixture's shape in the script; then update
`tests/fixtures/pdf/bac_credit_synthetic_goldens.py` to match.
