"""User profile photo rules — data-URI validation (pure domain, no framework imports).

Photo stays inline as a base64 data URI on the user record (no media storage/CDN).
No server-side re-encoding/resizing — the client resizes to 256x256 before upload;
the backend only validates the shape and enforces the decoded-size cap.
"""

from __future__ import annotations

import base64
import binascii

from domain.errors import InvalidPhotoError

PHOTO_MAX_DECODED_BYTES = 300_000
# Base64 expands payloads by ~4/3 — reject on the cheap encoded-length check
# before spending time/memory decoding an oversized string.
PHOTO_MAX_ENCODED_CHARS = (PHOTO_MAX_DECODED_BYTES * 4 // 3) + 4
_ALLOWED_PREFIXES = ("data:image/png;base64,", "data:image/jpeg;base64,")


def validate_photo(value: str | None) -> str | None:
    """Return the photo data URI unchanged, or raise InvalidPhotoError.

    `None` means "no photo" and is always valid (used to clear the column).
    """
    if value is None:
        return None
    prefix = next((p for p in _ALLOWED_PREFIXES if value.startswith(p)), None)
    if prefix is None:
        raise InvalidPhotoError("Photo must start with a data:image/png or data:image/jpeg prefix.")
    encoded = value[len(prefix) :]
    if not encoded:
        raise InvalidPhotoError("Photo payload is empty.")
    if len(encoded) > PHOTO_MAX_ENCODED_CHARS:
        raise InvalidPhotoError("Photo exceeds the 300KB size limit.")
    try:
        decoded = base64.b64decode(encoded, validate=True)
    except (ValueError, binascii.Error) as exc:
        raise InvalidPhotoError("Photo must be valid base64.") from exc
    if len(decoded) > PHOTO_MAX_DECODED_BYTES:
        raise InvalidPhotoError("Photo exceeds the 300KB size limit.")
    return value
