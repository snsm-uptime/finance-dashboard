"""Shared section-header contract + statement-boundary detection (AD-25, AD-27).

Adapters declare their section vocabulary as a SectionSpec list instead of
reimplementing a private title->policy dict; SectionCursor walks an
adapter's extracted lines against that list once, here, rather than per
adapter. Statement-boundary detection follows one shared priority chain,
strongest evidence first: a printed page counter resetting to 1 > a
repeating per-statement marker (used only when no page counter exists) >
assume a single statement.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from domain.canonical_line import SECTION_POLICY_IGNORE

_PAGE_COUNTER_RE = re.compile(r"p[aá]gina\s+(\d+)\s+de\s+(\d+)", re.IGNORECASE)
_PAGE_COUNTER_EN_RE = re.compile(r"page\s+(\d+)\s+of\s+(\d+)", re.IGNORECASE)

BOUNDARY_METHOD_PAGE_COUNTER = "page_counter"
BOUNDARY_METHOD_REPEATING_MARKER = "repeating_marker_guess"
BOUNDARY_METHOD_ASSUMED_SINGLE = "no_evidence_assumed_single"


@dataclass(frozen=True, slots=True)
class SectionSpec:
    """One declared statement section: printed title -> line_type/policy.

    column_header is the printed column sub-header line some banks print
    immediately after the title (e.g. "NO. REFERENCIA FECHA CONCEPTO ...").
    SectionCursor consumes at most one such line per title without ending
    the "just saw a header" state.
    """

    title: str
    line_type: str | None
    policy: str
    column_header: str | None = None


class SectionCursor:
    """Walks statement lines against a declared SectionSpec list (AD-25)."""

    def __init__(self, sections: list[SectionSpec]) -> None:
        self._by_title = {spec.title: spec for spec in sections}
        self._active: SectionSpec | None = None
        self._awaiting_column_header = False
        self._unmapped = False

    def see_header_line(self, line: str) -> None:
        """Feed a non-data (title / column-header) line, updating cursor state."""
        spec = self._by_title.get(line)
        if spec is not None:
            self._active = spec
            self._awaiting_column_header = spec.column_header is not None
            self._unmapped = False
            return

        if (
            self._awaiting_column_header
            and self._active is not None
            and line == self._active.column_header
        ):
            self._awaiting_column_header = False
            return

        # An unrecognized header-ish line — subsequent data rows are unmapped
        # until the next declared title is seen (not a silent drop, AC #3).
        self._active = None
        self._awaiting_column_header = False
        self._unmapped = True

    def classify_data_row(self) -> tuple[str, SectionSpec | None]:
        """Classify a data row under the cursor's current state.

        Returns ("data", spec), ("ignored", None), or ("unmapped", None).
        """
        if self._unmapped or self._active is None:
            return "unmapped", None
        if self._active.policy == SECTION_POLICY_IGNORE:
            return "ignored", None
        return "data", self._active


def _page_counter(lines: list[str]) -> tuple[int, int] | None:
    for line in lines:
        match = _PAGE_COUNTER_RE.search(line) or _PAGE_COUNTER_EN_RE.search(line)
        if match:
            return int(match.group(1)), int(match.group(2))
    return None


def detect_statement_boundaries(
    pages: list[list[str]], *, marker: str | None
) -> tuple[list[int], str]:
    """Shared statement-boundary priority chain (AD-27).

    pages: extracted text lines per page, in document order. marker: the
    adapter's repeating per-statement marker line, used only as a fallback
    when no page counter is found anywhere in the document.

    Returns (boundaries, method) — boundaries are 0-indexed page indices
    where a new statement starts; method records which rule fired, so
    callers can retain it for test/debug visibility rather than discard it.
    """
    page_counters = [_page_counter(page_lines) for page_lines in pages]
    if any(pc is not None for pc in page_counters):
        boundaries = [i for i, pc in enumerate(page_counters) if pc is not None and pc[0] == 1]
        if not boundaries or boundaries[0] != 0:
            boundaries = sorted({0, *boundaries})
        return boundaries, BOUNDARY_METHOD_PAGE_COUNTER

    if marker:
        boundaries = [
            i for i, page_lines in enumerate(pages) if any(marker in line for line in page_lines)
        ]
        if boundaries:
            if boundaries[0] != 0:
                boundaries = sorted({0, *boundaries})
            return boundaries, BOUNDARY_METHOD_REPEATING_MARKER

    return [0], BOUNDARY_METHOD_ASSUMED_SINGLE
