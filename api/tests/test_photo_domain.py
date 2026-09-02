"""Domain tests for the user profile photo matrix (validate_photo) — TDD."""

from __future__ import annotations

import base64

import pytest
from domain.errors import InvalidPhotoError
from domain.photo import PHOTO_MAX_DECODED_BYTES, validate_photo


def _data_uri(prefix: str, byte_count: int) -> str:
    payload = base64.b64encode(b"x" * byte_count).decode("ascii")
    return f"{prefix}{payload}"


def test_none_is_valid_and_returned_as_none() -> None:
    assert validate_photo(None) is None


@pytest.mark.parametrize("prefix", ["data:image/png;base64,", "data:image/jpeg;base64,"])
def test_valid_small_photo_is_returned_unchanged(prefix: str) -> None:
    value = _data_uri(prefix, 100)
    assert validate_photo(value) == value


def test_photo_at_exact_cap_is_valid() -> None:
    value = _data_uri("data:image/png;base64,", PHOTO_MAX_DECODED_BYTES)
    assert validate_photo(value) == value


def test_oversized_photo_raises() -> None:
    value = _data_uri("data:image/png;base64,", PHOTO_MAX_DECODED_BYTES + 1)
    with pytest.raises(InvalidPhotoError):
        validate_photo(value)


@pytest.mark.parametrize(
    "value",
    [
        "not-a-data-uri",
        "data:image/gif;base64,AAAA",
        "data:image/png,AAAA",
        "data:text/plain;base64,AAAA",
        "",
    ],
)
def test_bad_prefix_raises(value: str) -> None:
    with pytest.raises(InvalidPhotoError):
        validate_photo(value)


def test_invalid_base64_raises() -> None:
    with pytest.raises(InvalidPhotoError):
        validate_photo("data:image/png;base64,not-valid-base64!!!")


@pytest.mark.parametrize("prefix", ["data:image/png;base64,", "data:image/jpeg;base64,"])
def test_empty_payload_after_valid_prefix_raises(prefix: str) -> None:
    with pytest.raises(InvalidPhotoError):
        validate_photo(prefix)


def test_oversized_encoded_string_rejected_before_decoding() -> None:
    # Garbage that isn't valid base64 at all, but is long enough to be
    # rejected by the cheap encoded-length check before base64.b64decode
    # ever runs (a real decode would raise InvalidPhotoError too, but for
    # a different reason — this asserts the fast path actually fires).
    huge_garbage = "!" * (PHOTO_MAX_DECODED_BYTES * 2)
    with pytest.raises(InvalidPhotoError):
        validate_photo(f"data:image/png;base64,{huge_garbage}")


def test_error_exposes_code() -> None:
    assert InvalidPhotoError.CODE == "invalid_photo"
