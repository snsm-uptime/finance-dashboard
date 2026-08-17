"""Domain tests for the shared section-header contract + boundary detection (AD-25, AD-27)."""

from __future__ import annotations

from domain.canonical_line import (
    SECTION_POLICY_BEST_EFFORT,
    SECTION_POLICY_IGNORE,
    SECTION_POLICY_MUST_PARSE,
)
from domain.statement_layout import (
    BOUNDARY_METHOD_ASSUMED_SINGLE,
    BOUNDARY_METHOD_PAGE_COUNTER,
    BOUNDARY_METHOD_REPEATING_MARKER,
    SectionCursor,
    SectionSpec,
    detect_statement_boundaries,
)

_SECTIONS = [
    SectionSpec("Detalle de compras", "purchase", SECTION_POLICY_MUST_PARSE),
    SectionSpec(
        "Productos y servicios de elección voluntaria",
        "voluntary_service",
        SECTION_POLICY_BEST_EFFORT,
        column_header="FECHA CONCEPTO MONTO",
    ),
    SectionSpec("Saldo Anterior", None, SECTION_POLICY_IGNORE),
]


def test_data_row_under_declared_section_is_classified_as_data() -> None:
    cursor = SectionCursor(_SECTIONS)
    cursor.see_header_line("Detalle de compras")
    kind, spec = cursor.classify_data_row()
    assert kind == "data"
    assert spec is not None
    assert spec.line_type == "purchase"


def test_data_row_with_no_section_seen_yet_is_unmapped() -> None:
    cursor = SectionCursor(_SECTIONS)
    kind, spec = cursor.classify_data_row()
    assert (kind, spec) == ("unmapped", None)


def test_unrecognized_header_line_marks_unmapped_until_next_declared_title() -> None:
    cursor = SectionCursor(_SECTIONS)
    cursor.see_header_line("Detalle de compras")
    cursor.see_header_line("Some Unrecognized Section")
    assert cursor.classify_data_row()[0] == "unmapped"
    cursor.see_header_line("Detalle de compras")
    assert cursor.classify_data_row()[0] == "data"


def test_ignore_policy_section_classifies_as_ignored() -> None:
    cursor = SectionCursor(_SECTIONS)
    cursor.see_header_line("Saldo Anterior")
    assert cursor.classify_data_row() == ("ignored", None)


def test_column_header_is_consumed_without_ending_header_state() -> None:
    cursor = SectionCursor(_SECTIONS)
    cursor.see_header_line("Productos y servicios de elección voluntaria")
    cursor.see_header_line("FECHA CONCEPTO MONTO")
    kind, spec = cursor.classify_data_row()
    assert kind == "data"
    assert spec is not None
    assert spec.line_type == "voluntary_service"


def test_unrelated_line_after_awaiting_column_header_still_unmapped() -> None:
    cursor = SectionCursor(_SECTIONS)
    cursor.see_header_line("Productos y servicios de elección voluntaria")
    cursor.see_header_line("Some Other Unrecognized Line")
    assert cursor.classify_data_row()[0] == "unmapped"


def test_boundaries_detected_via_page_counter_resetting_to_one() -> None:
    pages = [
        ["Página 1 de 2"],
        ["Página 2 de 2"],
        ["Página 1 de 1"],
    ]
    boundaries, method = detect_statement_boundaries(pages, marker=None)
    assert boundaries == [0, 2]
    assert method == BOUNDARY_METHOD_PAGE_COUNTER


def test_boundaries_page_counter_forces_leading_page_zero_even_without_reset() -> None:
    pages = [
        ["cover page, no counter"],
        ["Página 1 de 2"],
        ["Página 2 de 2"],
    ]
    boundaries, method = detect_statement_boundaries(pages, marker=None)
    assert boundaries[0] == 0
    assert method == BOUNDARY_METHOD_PAGE_COUNTER


def test_boundaries_fall_back_to_repeating_marker_when_no_page_counter() -> None:
    pages = [
        ["ESTADO DE CUENTA BAC CREDITO", "row 1"],
        ["more of statement 1"],
        ["ESTADO DE CUENTA BAC CREDITO", "row 1"],
    ]
    boundaries, method = detect_statement_boundaries(pages, marker="ESTADO DE CUENTA BAC CREDITO")
    assert boundaries == [0, 2]
    assert method == BOUNDARY_METHOD_REPEATING_MARKER


def test_boundaries_marker_fallback_includes_leading_page_even_if_marker_missing_on_page_zero() -> (
    None
):
    pages = [
        ["cover page"],
        ["ESTADO DE CUENTA BAC CREDITO"],
        ["ESTADO DE CUENTA BAC CREDITO"],
    ]
    boundaries, method = detect_statement_boundaries(pages, marker="ESTADO DE CUENTA BAC CREDITO")
    assert boundaries[0] == 0
    assert method == BOUNDARY_METHOD_REPEATING_MARKER


def test_boundaries_assume_single_statement_when_no_evidence() -> None:
    pages = [["nothing recognizable"], ["still nothing"]]
    boundaries, method = detect_statement_boundaries(pages, marker="NEVER PRESENT")
    assert boundaries == [0]
    assert method == BOUNDARY_METHOD_ASSUMED_SINGLE
