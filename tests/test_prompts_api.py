"""L3 Prompt HTTP API 测试。

覆盖：
- 健康检查 / 能力声明；
- 成功生成（Mock，不联网）；
- data-source / JSX 片段硬校验；
- Origin / Session / requestId 安全校验；
- 点位、图片、轨迹类型校验；
- CORS 预检与请求头回显。
"""

from __future__ import annotations

import base64
from typing import Any

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

ORIGIN = "http://127.0.0.1:5174"
SESSION = "st_test12345678"
REQUEST_ID = "req_test123"
SOURCE = "src/components/Button.tsx:12:5"


def _headers(
    *,
    origin: str | None = ORIGIN,
    session: str | None = SESSION,
    request_id: str | None = REQUEST_ID,
) -> dict[str, str]:
    """构造 L3 请求头；None 表示故意省略。"""
    headers: dict[str, str] = {"Content-Type": "application/json"}
    if origin is not None:
        headers["Origin"] = origin
    if session is not None:
        headers["X-Vibe-Session"] = session
    if request_id is not None:
        headers["X-Vibe-Request-Id"] = request_id
    return headers


def _target() -> dict[str, Any]:
    return {
        "source": SOURCE,
        "sourceKind": "host",
        "tag": "button",
        "text": "提交",
        "rect": {"x": 10, "y": 20, "width": 100, "height": 32},
        "coordinateSpace": "world",
        "layout": {"display": "inline-flex", "fontSize": "14px"},
        "neighbors": [],
        "truncated": {"text": False, "neighbors": False},
    }


def _snippet() -> dict[str, Any]:
    return {
        "source": SOURCE,
        "startLine": 12,
        "endLine": 14,
        "content": '<button className="primary">提交</button>',
        "truncated": False,
    }


def _annotation(annotation_type: str = "note") -> dict[str, Any]:
    return {
        "annotationId": "ann_1",
        "type": annotation_type,
        "intent": "把按钮主色改成蓝色",
        "createdAt": "2026-11-02T10:00:00Z",
        "target": _target(),
        "jsxSnippet": _snippet(),
    }


def _payload(annotations: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    return {
        "requestId": REQUEST_ID,
        "protocolVersion": "0.1",
        "project": {
            "name": "demo-app",
            "framework": "vite-react",
            "previewOrigin": "http://127.0.0.1:5173",
        },
        "locale": "zh-CN",
        "annotations": annotations or [_annotation()],
        "options": {"outputLanguage": "zh-CN", "maxPromptChars": 12000},
    }


def _visual(points: list[dict[str, float]] | None = None) -> dict[str, Any]:
    points = points or [{"x": 10, "y": 10}, {"x": 20, "y": 20}]
    return {
        "kind": "draw",
        "points": points,
        "pointCount": len(points),
        "downsampledFrom": 500,
        "bbox": {"x": 10, "y": 10, "width": 100, "height": 50},
        "stroke": {"color": "#ef4444", "width": 3},
        "relatedSources": [SOURCE],
        "spatialSummary": "圈住了提交按钮",
    }


def _tiny_image() -> dict[str, Any]:
    payload = base64.b64encode(b"fake-png-bytes").decode()
    return {
        "mime": "image/png",
        "dataUrl": f"data:image/png;base64,{payload}",
        "width": 300,
        "height": 120,
        "bytes": len(b"fake-png-bytes"),
        "croppedToTarget": True,
    }


def _post(payload: dict[str, Any], headers: dict[str, str]) -> Any:
    return client.post("/api/v1/prompts/generate", json=payload, headers=headers)


# ---------------------------------------------------------------- 系统接口


def test_api_health() -> None:
    resp = client.get("/api/v1/health")
    assert resp.status_code == 200

    body = resp.json()
    assert body["status"] == "ok"
    assert body["service"] == "vibe-prompt-service"
    assert body["apiVersion"] == "v1"
    assert body["protocolVersion"] == "0.1"
    assert "time" in body


def test_capabilities_declares_limits_and_features() -> None:
    resp = client.get("/api/v1/capabilities")
    assert resp.status_code == 200

    body = resp.json()
    assert body["model"] == {
        "provider": "mock",
        "name": "mock-prompt-v1",
        "multimodal": False,
    }
    limits = body["limits"]
    assert limits["maxSnapshotElements"] == 200
    assert limits["maxPointsPerStroke"] == 100
    assert limits["maxRecordedPointsPerStroke"] == 5000
    assert limits["maxSnippetLines"] == 40
    assert limits["maxSnippetBytes"] == 4096
    assert limits["maxImageBytes"] == 1024 * 1024
    assert limits["maxImageEdge"] == 1600
    assert limits["maxAnnotationsPerRequest"] == 50
    assert limits["maxRequestBodyBytes"] == 8 * 1024 * 1024

    features = body["features"]
    assert features["markdownOnly"] is True
    assert features["sourceRequired"] is True
    assert features["snippetRequired"] is True
    assert features["serverHistory"] is False
    assert features["streaming"] is False
    assert features["imageInput"] is False
    assert features["snapshotFiltersDisplayNone"] is True


# ---------------------------------------------------------------- 成功路径


def test_generate_mock_prompt() -> None:
    resp = _post(_payload(), _headers())

    assert resp.status_code == 200, resp.text
    assert resp.headers["X-Vibe-Request-Id"] == REQUEST_ID

    body = resp.json()
    assert body["status"] == "ok"
    assert body["requestId"] == REQUEST_ID
    assert body["prompt"]["format"] == "markdown"
    assert body["prompt"]["charCount"] == len(body["prompt"]["content"])
    assert body["prompt"]["truncated"] is False
    assert body["prompt"]["targetFiles"] == ["src/components/Button.tsx"]
    assert SOURCE in body["prompt"]["content"]
    assert "提交" in body["prompt"]["content"]
    assert body["model"] == {
        "provider": "mock",
        "name": "mock-prompt-v1",
    }
    assert body["usage"] is None
    assert body["warnings"] == []


def test_generate_draw_within_point_limit() -> None:
    annotation = _annotation("draw")
    annotation["visual"] = _visual()
    resp = _post(_payload([annotation]), _headers())

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "bbox" in body["prompt"]["content"]
    assert "关键点 2 个" in body["prompt"]["content"]


def test_image_ignored_warning_when_model_has_no_vision() -> None:
    annotation = _annotation("draw")
    visual = _visual()
    visual["image"] = _tiny_image()
    annotation["visual"] = visual

    resp = _post(_payload([annotation]), _headers())

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "partial"
    assert [item["code"] for item in body["warnings"]] == [
        "IMAGE_IGNORED_MODEL_NO_VISION"
    ]


# ---------------------------------------------------------------- 硬校验


def test_missing_target_returns_source_required() -> None:
    annotation = _annotation()
    annotation.pop("target")

    resp = _post(_payload([annotation]), _headers())

    assert resp.status_code == 400, resp.text
    assert resp.json()["error"]["code"] == "SOURCE_REQUIRED"


def test_blank_source_returns_source_required() -> None:
    annotation = _annotation()
    annotation["target"]["source"] = ""

    resp = _post(_payload([annotation]), _headers())

    assert resp.status_code == 400, resp.text
    assert resp.json()["error"]["code"] == "SOURCE_REQUIRED"


def test_missing_snippet_returns_snippet_required() -> None:
    annotation = _annotation()
    annotation.pop("jsxSnippet")

    resp = _post(_payload([annotation]), _headers())

    assert resp.status_code == 400, resp.text
    assert resp.json()["error"]["code"] == "SNIPPET_REQUIRED"


def test_snippet_source_mismatch_returns_snippet_required() -> None:
    annotation = _annotation()
    annotation["jsxSnippet"]["source"] = "src/components/Other.tsx:1:1"

    resp = _post(_payload([annotation]), _headers())

    assert resp.status_code == 400, resp.text
    assert resp.json()["error"]["code"] == "SNIPPET_REQUIRED"


def test_too_many_points_returns_request_too_large() -> None:
    annotation = _annotation("draw")
    points = [{"x": float(i), "y": float(i)} for i in range(101)]
    annotation["visual"] = _visual(points)

    resp = _post(_payload([annotation]), _headers())

    assert resp.status_code == 413, resp.text
    assert resp.json()["error"]["code"] == "REQUEST_TOO_LARGE"


def test_oversized_image_returns_image_too_large() -> None:
    annotation = _annotation("draw")
    visual = _visual()
    image = _tiny_image()
    image["width"] = 1601
    visual["image"] = image
    annotation["visual"] = visual

    resp = _post(_payload([annotation]), _headers())

    assert resp.status_code == 413, resp.text
    assert resp.json()["error"]["code"] == "IMAGE_TOO_LARGE"


def test_draw_without_visual_is_rejected() -> None:
    annotation = _annotation("draw")

    resp = _post(_payload([annotation]), _headers())

    assert resp.status_code == 400, resp.text
    assert resp.json()["error"]["code"] == "VALIDATION_FAILED"


def test_drag_without_drag_is_rejected() -> None:
    annotation = _annotation("drag")

    resp = _post(_payload([annotation]), _headers())

    assert resp.status_code == 400, resp.text
    assert resp.json()["error"]["code"] == "VALIDATION_FAILED"


def test_drag_delta_mismatch_is_rejected() -> None:
    annotation = _annotation("drag")
    annotation["drag"] = {
        "kind": "drag",
        "from": {"x": 10, "y": 20},
        "to": {"x": 30, "y": 40},
        "delta": {"dx": 99, "dy": 20},
        "axis": "both",
        "relatedSources": [SOURCE],
        "spatialSummary": "向右下方移动",
    }

    resp = _post(_payload([annotation]), _headers())

    assert resp.status_code == 400, resp.text
    assert resp.json()["error"]["code"] == "VALIDATION_FAILED"


def test_drag_delta_is_rendered_in_prompt() -> None:
    annotation = _annotation("drag")
    annotation["drag"] = {
        "kind": "drag",
        "from": {"x": 10, "y": 20},
        "to": {"x": 30, "y": 60},
        "delta": {"dx": 20, "dy": 40},
        "axis": "both",
        "relatedSources": [SOURCE],
        "spatialSummary": "按钮向右下方移动",
    }

    resp = _post(_payload([annotation]), _headers())

    assert resp.status_code == 200, resp.text
    content = resp.json()["prompt"]["content"]
    assert "dx=20.0, dy=40.0" in content
    assert "按钮向右下方移动" in content


# ---------------------------------------------------------------- 安全校验


def test_missing_origin_is_rejected() -> None:
    resp = _post(_payload(), _headers(origin=None))

    assert resp.status_code == 403, resp.text
    assert resp.json()["error"]["code"] == "ORIGIN_NOT_ALLOWED"


def test_untrusted_origin_is_rejected() -> None:
    resp = _post(_payload(), _headers(origin="http://evil.example.com"))

    assert resp.status_code == 403, resp.text
    assert resp.json()["error"]["code"] == "ORIGIN_NOT_ALLOWED"


def test_missing_session_is_rejected() -> None:
    resp = _post(_payload(), _headers(session=None))

    assert resp.status_code == 401, resp.text
    assert resp.json()["error"]["code"] == "SESSION_INVALID"


def test_malformed_session_is_rejected() -> None:
    resp = _post(_payload(), _headers(session="not-a-session"))

    assert resp.status_code == 401, resp.text
    assert resp.json()["error"]["code"] == "SESSION_INVALID"


def test_missing_request_id_header_is_rejected() -> None:
    resp = _post(_payload(), _headers(request_id=None))

    assert resp.status_code == 400, resp.text
    assert resp.json()["error"]["code"] == "INVALID_REQUEST"


def test_request_id_mismatch_is_rejected() -> None:
    resp = _post(_payload(), _headers(request_id="req_other123"))

    assert resp.status_code == 400, resp.text
    assert resp.json()["error"]["code"] == "VALIDATION_FAILED"


def test_incompatible_protocol_major_is_rejected() -> None:
    payload = _payload()
    payload["protocolVersion"] = "1.0"

    resp = _post(payload, _headers())

    assert resp.status_code == 400, resp.text
    assert resp.json()["error"]["code"] == "VALIDATION_FAILED"


def test_validation_error_does_not_echo_input() -> None:
    """错误响应只暴露字段位置与类型，不回显用户原文 / 图片。"""
    annotation = _annotation()
    annotation["target"]["source"] = ""

    resp = _post(_payload([annotation]), _headers())
    raw = resp.text

    assert "提交" not in raw
    assert "data:image" not in raw
    fields = resp.json()["error"]["details"]["fields"]
    assert any("source" in item["loc"] for item in fields)


# ---------------------------------------------------------------- CORS


def test_cors_preflight_allows_configured_origin() -> None:
    resp = client.options(
        "/api/v1/prompts/generate",
        headers={
            "Origin": ORIGIN,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": (
                "content-type,x-vibe-session,x-vibe-request-id"
            ),
        },
    )

    assert resp.status_code == 200, resp.text
    assert resp.headers["access-control-allow-origin"] == ORIGIN
    assert "X-Vibe-Session" in resp.headers["access-control-allow-headers"]


def test_cors_preflight_rejects_untrusted_origin() -> None:
    resp = client.options(
        "/api/v1/prompts/generate",
        headers={
            "Origin": "http://evil.example.com",
            "Access-Control-Request-Method": "POST",
        },
    )

    assert resp.status_code == 400
    assert "access-control-allow-origin" not in resp.headers
