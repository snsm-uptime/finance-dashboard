"""Postgres integration tests for the profile-photo PATCH /auth/me path.

Requires DATABASE_URL (Compose db or CI Postgres 16). Skips when unset.
"""

from __future__ import annotations

import base64

import pytest
from fastapi.testclient import TestClient
from tests.integration_db import database_url

pytestmark = pytest.mark.skipif(
    database_url() is None,
    reason="DATABASE_URL not set — Postgres 16 required for integration tests",
)

_TINY_PNG_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
)


def _register(client: TestClient, email: str) -> None:
    response = client.post(
        "/auth/register",
        json={"email": email, "password": "password1"},
    )
    assert response.status_code == 201, response.text


def test_photo_round_trip(client: TestClient) -> None:
    _register(client, "hank-photo@example.com")
    data_uri = f"data:image/png;base64,{_TINY_PNG_B64}"

    saved = client.patch("/auth/me", json={"photo_base64": data_uri})
    assert saved.status_code == 200, saved.text
    assert saved.json()["photo_base64"] == data_uri
    assert client.get("/auth/me").json()["photo_base64"] == data_uri


def test_photo_can_be_cleared(client: TestClient) -> None:
    _register(client, "ivy-photo@example.com")
    data_uri = f"data:image/png;base64,{_TINY_PNG_B64}"
    assert client.patch("/auth/me", json={"photo_base64": data_uri}).status_code == 200

    cleared = client.patch("/auth/me", json={"photo_base64": None})
    assert cleared.status_code == 200, cleared.text
    assert cleared.json()["photo_base64"] is None
    assert client.get("/auth/me").json()["photo_base64"] is None


@pytest.mark.parametrize(
    "bad",
    [
        "not-a-data-uri",
        "data:image/gif;base64,AAAA",
        "data:image/png;base64,",
        "data:image/png;base64,not-valid-base64!!!",
        f"data:image/png;base64,{base64.b64encode(b'0' * 400_000).decode()}",
    ],
)
def test_invalid_photo_rejected(client: TestClient, bad: str) -> None:
    _register(client, f"jack-photo-{abs(hash(bad))}@example.com")

    response = client.patch("/auth/me", json={"photo_base64": bad})
    assert response.status_code == 422, response.text
    assert response.json()["code"] == "invalid_photo"
    assert client.get("/auth/me").json()["photo_base64"] is None


def test_photo_at_the_decoded_size_cap_is_accepted(client: TestClient) -> None:
    _register(client, "kate-photo@example.com")
    # Just under the 300KB decoded cap.
    payload = base64.b64encode(b"0" * 299_000).decode()
    data_uri = f"data:image/jpeg;base64,{payload}"

    response = client.patch("/auth/me", json={"photo_base64": data_uri})
    assert response.status_code == 200, response.text
