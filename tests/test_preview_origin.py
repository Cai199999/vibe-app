"""previewOrigin 语法与远程开关策略测试。"""

from __future__ import annotations

import pytest

from app.core.preview_origin import (
    PreviewOriginError,
    ensure_preview_origin_allowed,
    normalize_preview_origin,
)


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("http://localhost:5173", "http://localhost:5173"),
        ("http://localhost:5173/", "http://localhost:5173"),
        ("http://localhost.:5173", "http://localhost:5173"),
        ("http://127.0.0.2:5173", "http://127.0.0.2:5173"),
        ("http://[::1]:5173", "http://[::1]:5173"),
        ("https://example.com:443", "https://example.com"),
    ],
)
def test_normalize_preview_origin(raw: str, expected: str) -> None:
    assert normalize_preview_origin(raw) == expected


@pytest.mark.parametrize(
    "raw",
    [
        "",
        "ftp://example.com:5173",
        "http://user:pass@example.com:5173",
        "http://example.com:5173/app",
        "http://example.com:5173?debug=1",
        "http://-bad-.example.com:5173",
        "http://999.999.999.999:5173",
    ],
)
def test_invalid_preview_origin_is_rejected(raw: str) -> None:
    with pytest.raises(PreviewOriginError):
        normalize_preview_origin(raw)


def test_remote_origin_denied_by_default() -> None:
    with pytest.raises(PreviewOriginError) as exc_info:
        ensure_preview_origin_allowed(
            "http://192.168.1.50:5173",
            allow_remote=False,
        )

    assert "ALLOW_REMOTE_PROJECTS" in str(exc_info.value)


def test_remote_origin_allowed_when_enabled() -> None:
    assert (
        ensure_preview_origin_allowed(
            "http://192.168.1.50:5173",
            allow_remote=True,
        )
        == "http://192.168.1.50:5173"
    )


@pytest.mark.parametrize(
    "port",
    [22, 2375, 3306, 5432, 6379, 8000, 9000, 9001, 9200, 27017],
)
def test_infrastructure_ports_are_always_blocked(port: int) -> None:
    with pytest.raises(PreviewOriginError) as exc_info:
        ensure_preview_origin_allowed(
            f"http://192.168.1.50:{port}",
            allow_remote=True,
        )

    assert str(port) in str(exc_info.value)
