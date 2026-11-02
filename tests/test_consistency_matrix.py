"""一致性矩阵测试：前后端契约、模型路由、配置兼容与脱敏 JSON 完整性。

本文件对应发布前的 Consistency Matrix Test：
1. 静态比对 `canvas-ui/src/types/vibe.ts` 与 Pydantic Schema 的字段名 / 类型；
2. 覆盖 DeepSeek / Ollama × 源码 / 视觉四种路由组合；
3. 验证旧变量 `PROMPT_PROVIDER` 单独配置时仍可路由；
4. 验证脱敏后的 JSON 仍可解析，且 JSX 结构未被破坏。

所有模型调用都使用 `httpx.MockTransport`，不访问外网、不依赖真实 Ollama。
"""

from __future__ import annotations

import asyncio
import json
import re
from pathlib import Path
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.core.errors import ApiError
from app.main import app
from app.schemas.prompt import (
    Annotation,
    Drag,
    GenerateOptions,
    JSXSnippet,
    Neighbor,
    Point,
    PromptGenerateRequest,
    Rect,
    Target,
    Visual,
)
from app.services.prompt_context import build_prompt_context
from app.services.prompt_generator import (
    DeepSeekPromptGenerator,
    OllamaPromptGenerator,
    RedactingPromptGenerator,
    build_prompt_generator,
)

ROOT = Path(__file__).resolve().parents[1]
VIBE_TYPES = ROOT / "canvas-ui" / "src" / "types" / "vibe.ts"
PROMPT_API = ROOT / "canvas-ui" / "src" / "api" / "promptApi.ts"
PROMPT_HOOK = ROOT / "canvas-ui" / "src" / "hooks" / "usePromptGeneration.ts"
PROMPT_RESULT = ROOT / "canvas-ui" / "src" / "components" / "panel" / "PromptResult.tsx"

SOURCE = "src/components/Button.tsx:12:5"
TINY_PNG_DATA_URL = (
    "data:image/png;base64,"
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk"
    "+A8AAQUBAScY42YAAAAASUVORK5CYII="
)


# ---------------------------------------------------------------- 请求夹具


def _source_request(snippet: str | None = None) -> PromptGenerateRequest:
    """源码模式请求：必须带 target 与 JSX 片段。"""
    return PromptGenerateRequest.model_validate(
        {
            "requestId": "req_matrix001",
            "protocolVersion": "0.1",
            "project": {
                "name": "demo-app",
                "framework": "vite-react",
                "previewOrigin": "http://127.0.0.1:5173",
            },
            "locale": "zh-CN",
            "annotations": [
                {
                    "annotationId": "ann_matrix1",
                    "type": "note",
                    "intent": "把按钮主色改成蓝色",
                    "createdAt": "2026-11-02T10:00:00Z",
                    "target": {
                        "source": SOURCE,
                        "sourceKind": "host",
                        "tag": "button",
                        "text": "提交",
                        "rect": {
                            "x": 10,
                            "y": 20,
                            "width": 100,
                            "height": 32,
                        },
                        "coordinateSpace": "world",
                        "layout": {"display": "inline-flex"},
                        "neighbors": [],
                    },
                    "jsxSnippet": {
                        "source": SOURCE,
                        "startLine": 12,
                        "endLine": 14,
                        "content": snippet
                        or '<button className="primary">提交</button>',
                    },
                }
            ],
            "options": {"outputLanguage": "zh-CN", "maxPromptChars": 12000},
        }
    )


def _visual_payload() -> dict[str, Any]:
    """仅视觉模式请求体：visual-draw + 顶层截图。"""
    return {
        "requestId": "req_matrix002",
        "protocolVersion": "0.1",
        "project": {
            "name": "demo-app",
            "framework": "vite-react",
            "previewOrigin": "http://127.0.0.1:5173",
        },
        "locale": "zh-CN",
        "annotations": [
            {
                "annotationId": "ann_visual1",
                "type": "visual-draw",
                "intent": "把红圈里的搜索框加宽",
                "createdAt": "2026-11-02T10:00:00Z",
                "visual": {
                    "kind": "draw",
                    "points": [{"x": 10, "y": 20}],
                    "pointCount": 1,
                    "downsampledFrom": 30,
                    "bbox": {"x": 10, "y": 20, "width": 200, "height": 60},
                    "stroke": {"color": "#ef4444", "width": 6},
                    "relatedSources": [],
                    "spatialSummary": "红色轨迹圈住顶部搜索框。",
                },
            }
        ],
        "options": {"outputLanguage": "zh-CN", "maxPromptChars": 12000},
        "image_base64": TINY_PNG_DATA_URL,
    }


def _visual_request() -> PromptGenerateRequest:
    return PromptGenerateRequest.model_validate(_visual_payload())


def _capture_handler(
    captured: dict[str, Any],
    *,
    content: str = "src/components/Button.tsx\n\n## 修改任务\n调整按钮。",
) -> Any:
    """记录上游请求并返回稳定的 OpenAI 兼容响应。"""

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["headers"] = dict(request.headers)
        captured["body"] = json.loads(request.content)
        return httpx.Response(
            200,
            json={
                "choices": [{"message": {"content": content}}],
                "usage": {
                    "prompt_tokens": 10,
                    "completion_tokens": 5,
                    "total_tokens": 15,
                },
            },
        )

    return handler


# ---------------------------------------------------------------- 1. 契约一致性


_INTERFACE_RE = re.compile(
    r"(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)" r"(?:\s+extends\s+([^{]+))?\s*\{"
)


def _interfaces() -> dict[str, dict[str, tuple[str, bool]]]:
    """从 TypeScript 源码中提取接口属性：name -> (typeText, optional)。"""
    source = VIBE_TYPES.read_text(encoding="utf-8")
    result: dict[str, dict[str, tuple[str, bool]]] = {}

    for match in _INTERFACE_RE.finditer(source):
        name, base_names, body = match.group(1), match.group(2), None
        start = match.end()
        depth = 1
        index = start
        while index < len(source) and depth:
            char = source[index]
            if char == "{":
                depth += 1
            elif char == "}":
                depth -= 1
            index += 1
        body = source[start : index - 1]

        properties: dict[str, tuple[str, bool]] = {}
        pending_name: str | None = None
        pending_type: list[str] = []
        pending_depth = 0
        for raw_line in body.splitlines():
            line = raw_line.strip()
            if not line or line.startswith("//") or line.startswith("*"):
                continue

            if pending_name is not None:
                pending_type.append(line)
                pending_depth += line.count("{") - line.count("}")
                if pending_depth <= 0:
                    properties[pending_name] = (
                        " ".join(pending_type).rstrip(";").strip(),
                        pending_name.endswith("?"),
                    )
                    pending_name = None
                continue

            prop = re.match(
                r"^(?:readonly\s+)?([A-Za-z_$][\w$]*)(\?)?\s*:\s*(.*)$",
                line,
            )
            if prop is None:
                continue

            prop_name = prop.group(1)
            optional = bool(prop.group(2))
            type_text = prop.group(3).strip()
            nested = line.count("{") - line.count("}")
            if nested > 0:
                pending_name = prop_name + ("?" if optional else "")
                pending_type = [type_text]
                pending_depth = nested
            else:
                properties[prop_name] = (type_text.rstrip(";").strip(), optional)

        for base in (base_names or "").split(","):
            base = base.strip()
            if base and base in result:
                properties = {**result[base], **properties}
        result[name] = properties

    return result


# TypeScript 中这些别名实际是字符串枚举。
_STRING_ALIASES = {
    "AnnotationType",
    "Axis",
    "NeighborRelation",
    "SourceKind",
}
_SCHEMA_OBJECT_REFS = {
    "Point",
    "Rect",
    "Neighbor",
    "TruncatedFlags",
    "Visual",
    "Drag",
    "JSXSnippet",
    "Target",
    "Stroke",
    "ProjectInfo",
}


def _ts_kind(type_text: str) -> str:
    """把 TS 类型文本归一化为稳定的粗粒度类型。"""
    text = " ".join(type_text.split())
    if not text:
        return "object"
    if text.startswith("{"):
        return "object"
    if text.endswith("[]"):
        return "array"
    if text in {"string", "number", "boolean"}:
        return text
    if text.startswith(("'", '"')):
        return "string"
    if text in _STRING_ALIASES:
        return "string"
    if "|" in text:
        parts = [part.strip() for part in text.split("|")]
        if all(part.startswith(("'", '"')) for part in parts):
            return "string"
        return "union"
    return "object"


def _schema_kind(schema: dict[str, Any]) -> str:
    """把 Pydantic JSON Schema 归一化为同口径的粗粒度类型。"""
    if "$ref" in schema:
        ref = schema["$ref"].rsplit("/", 1)[-1]
        if ref in {"Point", "Rect", "Neighbor", "Visual", "Drag", "JSXSnippet"}:
            return "object"
        return "object"

    variants = schema.get("anyOf")
    if variants:
        non_null = [item for item in variants if item.get("type") != "null"]
        if len(non_null) == 1:
            return _schema_kind(non_null[0])
        return "union"

    declared = schema.get("type")
    if isinstance(declared, list):
        lowered = {item for item in declared if item != "null"}
        return (
            _schema_kind({"type": next(iter(lowered))})
            if len(lowered) == 1
            else "union"
        )
    if declared in {"integer", "number"}:
        return "number"
    if declared in {"string", "boolean", "array"}:
        return declared
    if declared == "object":
        return "object"
    if "enum" in schema:
        return "string"
    return "object"


_CONTRACT_MODELS: dict[str, type[Any]] = {
    "PromptGenerateRequest": PromptGenerateRequest,
    "ApiTarget": Target,
    "ApiVisual": Visual,
    "ApiDrag": Drag,
    "JSXSnippet": JSXSnippet,
    "Neighbor": Neighbor,
    "Rect": Rect,
    "Point": Point,
    "GenerateOptions": GenerateOptions,
}


def test_frontend_backend_contract_has_no_field_or_kind_mismatch() -> None:
    """前端请求体类型与后端 Pydantic Schema 必须逐字段对齐。"""
    interfaces = _interfaces()

    for interface_name, model in _CONTRACT_MODELS.items():
        assert interface_name in interfaces, f"前端缺少接口 {interface_name}"
        frontend = interfaces[interface_name]
        schema = model.model_json_schema(by_alias=True)
        backend = schema["properties"]
        backend_required = set(schema.get("required", []))

        unknown = set(frontend) - set(backend)
        assert not unknown, f"{interface_name} 的字段后端不存在: {sorted(unknown)}"

        absent = backend_required - set(frontend)
        assert not absent, f"{interface_name} 缺少后端必填字段: {sorted(absent)}"

        optional_frontend = {
            name for name, (_, optional) in frontend.items() if optional
        }
        required_mismatch = backend_required & optional_frontend
        assert (
            not required_mismatch
        ), f"{interface_name} 前端可选但后端必填: {sorted(required_mismatch)}"

        for field_name, (type_text, _) in frontend.items():
            if field_name not in backend:
                continue
            frontend_kind = _ts_kind(type_text)
            backend_kind = _schema_kind(backend[field_name])
            assert frontend_kind == backend_kind, (
                f"{interface_name}.{field_name} 类型不一致: "
                f"前端 {frontend_kind} / 后端 {backend_kind}"
            )

    # 标注联合类型：源码标注与仅视觉标注的字段都必须能被后端 Annotation 接收。
    annotation_schema = Annotation.model_json_schema(by_alias=True)
    annotation_fields = set(annotation_schema["properties"])
    for interface_name in ("ApiSourceAnnotation", "ApiVisualAnnotation"):
        assert set(interfaces[interface_name]) <= annotation_fields


def test_inline_project_contract_matches_project_info() -> None:
    """PromptGenerateRequest.project 的内联字段必须与 ProjectInfo 对齐。"""
    interfaces = _interfaces()
    project_type = interfaces["PromptGenerateRequest"]["project"][0]
    assert project_type.startswith("{")
    for field in ("name", "framework", "previewOrigin"):
        assert field in project_type
    assert interfaces["PromptGenerateRequest"]["project"][1] is False


# ---------------------------------------------------------------- 2. 状态矩阵


def test_matrix_cloud_source_mode() -> None:
    """云端 + 源码：文本模型、带鉴权、上下文含 JSX 片段。"""
    captured: dict[str, Any] = {}
    generator = DeepSeekPromptGenerator(
        Settings(prompt_provider="deepseek", deepseek_api_key="test-key"),
        transport=httpx.MockTransport(_capture_handler(captured)),
    )

    result = asyncio.run(
        generator.generate(build_prompt_context(_source_request(), include_image=False))
    )

    assert captured["url"] == "https://api.deepseek.com/chat/completions"
    assert captured["headers"]["authorization"] == "Bearer test-key"
    assert captured["body"]["model"] == "deepseek-chat"
    user_content = captured["body"]["messages"][1]["content"]
    assert isinstance(user_content, str)
    assert "jsxSnippet" in user_content
    assert "className" in user_content
    assert "image_url" not in user_content
    assert result.provider == "deepseek"
    assert result.model == "deepseek-chat"


def test_matrix_cloud_visual_mode() -> None:
    """云端 + 视觉：切到视觉模型并以 image_url 发送截图。"""
    captured: dict[str, Any] = {}
    generator = DeepSeekPromptGenerator(
        Settings(
            prompt_provider="deepseek",
            deepseek_api_key="test-key",
            deepseek_vision_model="deepseek-flash",
        ),
        transport=httpx.MockTransport(_capture_handler(captured)),
    )

    result = asyncio.run(
        generator.generate(build_prompt_context(_visual_request(), include_image=True))
    )

    assert captured["body"]["model"] == "deepseek-flash"
    user_content = captured["body"]["messages"][1]["content"]
    assert isinstance(user_content, list)
    assert any(
        part.get("type") == "image_url"
        and part["image_url"]["url"] == TINY_PNG_DATA_URL
        for part in user_content
    )
    assert all("imageDataUrl" not in part.get("text", "") for part in user_content)
    assert result.model == "deepseek-flash"


def test_matrix_ollama_source_mode_without_auth() -> None:
    """本地 Ollama + 源码：直连地址、无 Authorization、文本模型。"""
    captured: dict[str, Any] = {}
    generator = OllamaPromptGenerator(
        Settings(
            llm_provider="ollama",
            ollama_base_url="http://127.0.0.1:11434",
            ollama_model="qwen2.5:7b",
            ollama_vision_model="",
        ),
        transport=httpx.MockTransport(_capture_handler(captured)),
    )

    result = asyncio.run(
        generator.generate(build_prompt_context(_source_request(), include_image=False))
    )

    assert captured["url"] == "http://127.0.0.1:11434/v1/chat/completions"
    assert "authorization" not in captured["headers"]
    assert captured["body"]["model"] == "qwen2.5:7b"
    assert result.provider == "ollama"
    assert result.model == "qwen2.5:7b"


def test_matrix_ollama_visual_without_model_is_model_unavailable() -> None:
    """本地 Ollama + 视觉但未配置视觉模型：API 返回 MODEL_UNAVAILABLE。"""
    settings = Settings(
        llm_provider="ollama",
        ollama_model="qwen2.5:7b",
        ollama_vision_model="",
        allow_remote_projects=False,
        redact_sensitive=True,
    )

    def override() -> Settings:
        return settings

    app.dependency_overrides[get_settings] = override
    try:
        client = TestClient(app)
        response = client.post(
            "/api/v1/prompts/generate",
            json=_visual_payload(),
            headers={
                "Origin": "http://127.0.0.1:5174",
                "X-Vibe-Session": "st_matrix12345678",
                "X-Vibe-Request-Id": "req_matrix002",
                "Content-Type": "application/json",
            },
        )
    finally:
        app.dependency_overrides.pop(get_settings, None)

    assert response.status_code == 502
    body = response.json()
    assert body["error"]["code"] == "MODEL_UNAVAILABLE"
    # 缺少视觉模型属于配置错误，重试不会成功。
    assert body["error"]["retryable"] is False
    assert "OLLAMA_VISION_MODEL" in body["error"]["message"]


def test_generator_raises_model_unavailable_before_http() -> None:
    """未配置视觉模型时不应尝试连接 Ollama。"""

    def handler(request: httpx.Request) -> httpx.Response:
        raise AssertionError("未配置视觉模型时不应发起 HTTP 请求")

    generator = OllamaPromptGenerator(
        Settings(
            llm_provider="ollama",
            ollama_vision_model="",
        ),
        transport=httpx.MockTransport(handler),
    )

    with pytest.raises(ApiError) as exc_info:
        asyncio.run(
            generator.generate(
                build_prompt_context(_visual_request(), include_image=True)
            )
        )

    assert exc_info.value.code == "MODEL_UNAVAILABLE"


def test_frontend_maps_model_unavailable_to_visible_error() -> None:
    """前端必须把后端 error.code 透传并渲染 error.message。"""
    api_source = PROMPT_API.read_text(encoding="utf-8")
    hook_source = PROMPT_HOOK.read_text(encoding="utf-8")
    result_source = PROMPT_RESULT.read_text(encoding="utf-8")

    assert "code: body.error.code" in api_source
    assert "this.code = options.code ?? 'NETWORK_ERROR'" in api_source
    assert "code: error.code" in hook_source
    assert "{error.message}" in result_source


# ---------------------------------------------------------------- 3. 配置兼容


def test_only_legacy_prompt_provider_routes_deepseek(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """只配置旧变量 PROMPT_PROVIDER 时，后端仍应选择 DeepSeek。"""
    monkeypatch.delenv("LLM_PROVIDER", raising=False)
    monkeypatch.setenv("PROMPT_PROVIDER", "deepseek")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "legacy-key")

    settings = Settings(_env_file=None)

    assert settings.llm_provider == "deepseek"
    generator = build_prompt_generator(settings)
    assert generator.provider == "deepseek"
    assert generator.model == "deepseek-chat"
    assert isinstance(generator, RedactingPromptGenerator)


def test_new_provider_wins_over_legacy(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("LLM_PROVIDER", "ollama")
    monkeypatch.setenv("PROMPT_PROVIDER", "deepseek")

    settings = Settings(_env_file=None)

    assert settings.llm_provider == "ollama"


# ---------------------------------------------------------------- 4. 脱敏 JSON


def test_redacted_model_payload_is_valid_json_and_keeps_jsx_shape() -> None:
    """脱敏后发给模型的请求体必须仍是合法 JSON，JSX 结构保持完整。"""
    snippet = (
        "<button\n"
        '  className="primary"\n'
        "  onClick={handleSubmit}\n"
        '  data-user="alice@example.com"\n'
        '  data-token="sk-abcdefghijklmnopqrstuvwxyz123456"\n'
        ">\n"
        "  联系 alice@example.com\n"
        "</button>"
    )
    request = _source_request(snippet)
    payload = request.model_dump(by_alias=True)
    payload["annotations"][0]["intent"] = (
        "把按钮改蓝；联系 alice@example.com；"
        "数据库 postgresql://admin:s3cr3t-pass@db.internal/app"
    )
    request = PromptGenerateRequest.model_validate(payload)

    captured: dict[str, Any] = {}
    generator = RedactingPromptGenerator(
        OllamaPromptGenerator(
            Settings(
                llm_provider="ollama",
                ollama_model="qwen2.5:7b",
                ollama_vision_model="",
                ollama_max_snippet_chars=2000,
                redact_sensitive=True,
            ),
            transport=httpx.MockTransport(_capture_handler(captured)),
        )
    )

    asyncio.run(generator.generate(build_prompt_context(request, include_image=False)))

    # httpx.MockTransport 中已执行 json.loads，证明整个请求体是合法 JSON。
    assert captured["body"]["model"] == "qwen2.5:7b"
    user_text = captured["body"]["messages"][1]["content"]
    assert isinstance(user_text, str)

    block = user_text.split("<vibe_context>\n", 1)[1].rsplit("\n</vibe_context>", 1)[0]
    context = json.loads(block)
    annotation = context["annotations"][0]
    redacted_snippet = annotation["jsxSnippet"]["content"]
    intent = annotation["intent"]

    assert "alice@example.com" not in block
    assert "sk-abcdefghijklmnopqrstuvwxyz123456" not in block
    assert "s3cr3t-pass" not in block
    assert "postgresql://admin:[REDACTED]@db.internal/app" in intent

    # JSX 结构未被破坏：标签、属性名、事件处理器、引号与花括号仍完整。
    assert redacted_snippet.startswith("<button")
    assert redacted_snippet.rstrip().endswith("</button>")
    assert 'className="primary"' in redacted_snippet
    assert "onClick={handleSubmit}" in redacted_snippet
    assert redacted_snippet.count("{") == redacted_snippet.count("}")
    assert redacted_snippet.count('"') % 2 == 0
    assert annotation["jsxSnippet"]["source"] == SOURCE
    assert annotation["target"]["source"] == SOURCE
