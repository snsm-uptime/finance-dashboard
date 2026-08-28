"""Domain unit tests for description-alias pair validation (Story 5.6)."""

from domain.description_alias import normalize_alias_pair


class TestNormalizeAliasPair:
    def test_both_non_blank_returns_stripped_tuple(self) -> None:
        assert normalize_alias_pair("  Groceries  ", " SUPERMERCADO XYZ ") == (
            "Groceries",
            "SUPERMERCADO XYZ",
        )

    def test_identical_descriptions_still_returns_pair(self) -> None:
        assert normalize_alias_pair("Coffee", "Coffee") == ("Coffee", "Coffee")

    def test_manual_label_none_returns_none(self) -> None:
        assert normalize_alias_pair(None, "SUPERMERCADO XYZ") is None

    def test_bank_description_none_returns_none(self) -> None:
        assert normalize_alias_pair("Groceries", None) is None

    def test_manual_label_blank_returns_none(self) -> None:
        assert normalize_alias_pair("", "SUPERMERCADO XYZ") is None

    def test_bank_description_whitespace_only_returns_none(self) -> None:
        assert normalize_alias_pair("Groceries", "   ") is None

    def test_both_none_returns_none(self) -> None:
        assert normalize_alias_pair(None, None) is None
