"""Pure card label / IBAN validation rules (no FastAPI / SQLAlchemy)."""

from __future__ import annotations

import re

from domain.errors import InvalidCardIbanError, InvalidCardLabelError

CARD_LABEL_MAX_LENGTH = 100
CARD_IBAN_MAX_LENGTH = 64

_INTERNAL_WHITESPACE = re.compile(r"\s+")


def validate_card_label(raw: str) -> str:
    """Trim and validate a user-visible card label.

    Returns the normalized label. Raises InvalidCardLabelError when empty
    or whitespace-only after trim, or when longer than CARD_LABEL_MAX_LENGTH.
    """
    if raw is None:
        raise InvalidCardLabelError()
    label = raw.strip()
    if not label:
        raise InvalidCardLabelError()
    if len(label) > CARD_LABEL_MAX_LENGTH:
        raise InvalidCardLabelError(
            f"Card label must be at most {CARD_LABEL_MAX_LENGTH} characters."
        )
    return label


def normalize_iban(raw: str) -> str:
    """Trim, uppercase, and strip internal whitespace from an IBAN-like identifier.

    FR-37 allows "IBAN (or equivalent account/card identifier extracted from
    the statement)" — this treats the value as an opaque matching string, not
    a strict ISO 13616 IBAN (no checksum/country-prefix validation).
    """
    if raw is None:
        raise InvalidCardIbanError()
    iban = _INTERNAL_WHITESPACE.sub("", raw.strip()).upper()
    if not iban:
        raise InvalidCardIbanError()
    if len(iban) > CARD_IBAN_MAX_LENGTH:
        raise InvalidCardIbanError(f"IBAN must be at most {CARD_IBAN_MAX_LENGTH} characters.")
    return iban
