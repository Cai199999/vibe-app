"""Prompt 服务层测试：上下文最小化、输出约束与上游错误映射。"""

from __future__ import annotations

import asyncio
import json
from typing import Any

import httpx
import pytest

from app.config import Settings
from app.core.errors import ApiError
from app.schemas.prompt import PromptGenerateRequest
from app.services.prompt_context import build_prompt_context
from app.services.prompt_generator import (
    DeepSeekPromptGenerator,
    GeneratedPrompt,
    OllamaPromptGenerator,
    RedactingPromptGenerator,
    build_prompt_generator,
)
from app.services.prompt_service import PromptService

SOURCE = "src/components/Button.tsx:12:5"
TINY_PNG_DATA_URL = (
    "data:image/png;base64,"
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk"
    "+A8AAQUBAScY42YAAAAASUVORK5CYII="
)


def _request(
    *,
    annotation_type: str = "note",
    visual: dict[str, Any] | None = None,
) -> PromptGenerateRequest:
    annotation: dict[str, Any] = {
        "annotationId": "ann_1",
        "type": annotation_type,
        "intent": "把按钮主色改成蓝色",
        "createdAt": "2026-11-02T10:00:00Z",
        "target": {
            "source": SOURCE,
            "sourceKind": "host",
            "tag": "button",
            "text": "提交",
            "rect": {"x": 10, "y": 20, "width": 100, "height": 32},
            "coordinateSpace": "world",
            "layout": {},
            "neighbors": [],
        },
        "jsxSnippet": {
            "source": SOURCE,
            "startLine": 12,
            "endLine": 14,
            "content": '<button className="primary">提交</button>',
        },
    }
    if visual is not None:
        annotation["visual"] = visual

    return PromptGenerateRequest.model_validate(
        {
            "requestId": "req_service123",
            "protocolVersion": "0.1",
            "project": {
                "name": "demo-app",
                "framework": "vite-react",
                "previewOrigin": "http://127.0.0.1:5173",
            },
            "locale": "zh-CN",
            "annotations": [annotation],
            "options": {"outputLanguage": "zh-CN", "maxPromptChars": 12000},
        }
    )


def _visual_request() -> PromptGenerateRequest:
    """仅视觉标注 + 截图，用于验证视觉路由与上下文投影。"""
    return PromptGenerateRequest.model_validate(
        {
            "requestId": "req_visual123",
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
                        "bbox": {
                            "x": 10,
                            "y": 20,
                            "width": 200,
                            "height": 60,
                        },
                        "stroke": {"color": "#ef4444", "width": 6},
                        "relatedSources": [],
                        "spatialSummary": "红色轨迹圈住顶部搜索框。",
                    },
                }
            ],
            "options": {"outputLanguage": "zh-CN", "maxPromptChars": 12000},
            "image_base64": TINY_PNG_DATA_URL,
        }
    )


class _FakeGenerator:
    provider = "fake"
    model = "fake-model"
    supports_images = False

    def __init__(self, content: str) -> None:
        self.content = content

    async def generate(self, context: dict[str, Any]) -> GeneratedPrompt:
        return GeneratedPrompt(
            content=self.content,
            provider=self.provider,
            model=self.model,
        )


def test_context_drops_raw_points_and_image() -> None:
    """手绘原始点与图片不进入模型上下文，只保留空间摘要。"""
    visual = {
        "kind": "draw",
        "points": [{"x": 1, "y": 2}, {"x": 3, "y": 4}],
        "pointCount": 2,
        "downsampledFrom": 5000,
        "bbox": {"x": 1, "y": 2, "width": 50, "height": 60},
        "relatedSources": [SOURCE],
        "spatialSummary": "圈住按钮",
        "image": {
            "mime": "image/png",
            "dataUrl": "data:image/png;base64,aGVsbG8=",
            "width": 10,
            "height": 10,
            "bytes": 5,
        },
    }
    context = build_prompt_context(
        _request(annotation_type="draw", visual=visual),
        include_image=False,
    )

    projected = context["annotations"][0]["visual"]
    assert "points" not in projected
    assert "image" not in projected
    assert projected["pointCount"] == 2
    assert projected["downsampledFrom"] == 5000
    assert projected["bbox"]["width"] == 50


def test_deepseek_without_key_returns_model_unavailable() -> None:
    settings = Settings(prompt_provider="deepseek", deepseek_api_key="")
    generator = DeepSeekPromptGenerator(settings)

    with pytest.raises(ApiError) as exc_info:
        asyncio.run(generator.generate({}))

    assert exc_info.value.code == "MODEL_UNAVAILABLE"
    assert exc_info.value.status_code == 502


def test_service_rejects_diff_output() -> None:
    content = "src/components/Button.tsx\n\n" "```diff\n- old\n+ new\n```\n"
    service = PromptService(
        Settings(prompt_provider="mock"), generator=_FakeGenerator(content)
    )

    with pytest.raises(ApiError) as exc_info:
        asyncio.run(service.generate(_request()))

    assert exc_info.value.code == "OUTPUT_INVALID"


def test_service_rejects_oversized_code_block() -> None:
    block = "\n".join(f"const line{i} = {i};" for i in range(81))
    content = f"src/components/Button.tsx\n\n```jsx\n{block}\n```\n"
    service = PromptService(
        Settings(prompt_provider="mock"), generator=_FakeGenerator(content)
    )

    with pytest.raises(ApiError) as exc_info:
        asyncio.run(service.generate(_request()))

    assert exc_info.value.code == "OUTPUT_INVALID"


def test_service_truncates_prompt_with_warning() -> None:
    content = "src/components/Button.tsx\n" + ("长文本" * 800)
    service = PromptService(
        Settings(prompt_provider="mock"), generator=_FakeGenerator(content)
    )
    request = PromptGenerateRequest.model_validate(
        {
            **_request().model_dump(by_alias=True),
            "options": {"outputLanguage": "zh-CN", "maxPromptChars": 1000},
        }
    )

    result = asyncio.run(service.generate(request))

    assert result.prompt.truncated is True
    assert result.prompt.char_count <= 1000
    assert result.status == "partial"
    assert [warning.code for warning in result.warnings] == ["PROMPT_TRUNCATED"]


def test_visual_context_keeps_image_and_spatial_summary() -> None:
    context = build_prompt_context(_visual_request(), include_image=True)
    projected = context["annotations"][0]

    assert projected["target"] is None
    assert projected["jsxSnippet"] is None
    assert projected["visual"]["spatialSummary"] == "红色轨迹圈住顶部搜索框。"
    assert "points" not in projected["visual"]
    assert context["imageDataUrl"] == TINY_PNG_DATA_URL


def test_deepseek_image_route_uses_vision_model_and_red_prompt() -> None:
    """验证多模态请求：deepseek-flash、image_url 与红笔系统提示词。"""
    captured: dict[str, Any] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["payload"] = json.loads(request.content)
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {
                            "content": (
                                "## 修改任务\n"
                                "针对红圈标记的搜索框加宽，并保持现有布局。\n"
                            )
                        }
                    }
                ],
                "usage": {
                    "prompt_tokens": 120,
                    "completion_tokens": 30,
                    "total_tokens": 150,
                },
            },
        )

    settings = Settings(
        prompt_provider="deepseek",
        deepseek_api_key="test-key",
        deepseek_vision_model="deepseek-flash",
    )
    generator = DeepSeekPromptGenerator(
        settings,
        transport=httpx.MockTransport(handler),
    )
    context = build_prompt_context(_visual_request(), include_image=True)

    result = asyncio.run(generator.generate(context))

    payload = captured["payload"]
    assert payload["model"] == "deepseek-flash"
    assert result.model == "deepseek-flash"
    vision_system = payload["messages"][0]["content"]
    assert "红色手绘轨迹" in vision_system
    assert "这是一个基于视觉标注的修改需求" in vision_system
    assert "结合原有框架进行样式或组件的重构" in vision_system
    user_content = payload["messages"][1]["content"]
    assert isinstance(user_content, list)
    assert any(
        part.get("type") == "image_url"
        and part["image_url"]["url"] == TINY_PNG_DATA_URL
        for part in user_content
    )
    text_part = next(part for part in user_content if part["type"] == "text")
    assert "imageDataUrl" not in text_part["text"]
    assert "红色轨迹圈住顶部搜索框" in text_part["text"]
    assert "搜索框" in result.content


# ---------------------------------------------------------------- 脱敏


def _sensitive_request() -> PromptGenerateRequest:
    payload = _request().model_dump(by_alias=True)
    payload["annotations"][0]["intent"] = "联系 alice@example.com 或 13800138000"
    payload["annotations"][0]["jsxSnippet"]["content"] = (
        '<a href="mailto:alice@example.com" data-token="a1b2c3d4e5f6g7h8">' "联系</a>"
    )
    return PromptGenerateRequest.model_validate(payload)


def test_service_redacts_sensitive_text_before_model() -> None:
    """真实服务链路中，邮箱 / 手机号 / Token 不能出现在 Prompt 里。"""
    service = PromptService(
        Settings(prompt_provider="mock", redact_sensitive=True),
    )

    result = asyncio.run(service.generate(_sensitive_request()))
    content = result.prompt.content

    assert "alice@example.com" not in content
    assert "13800138000" not in content
    assert "a1b2c3d4e5f6g7h8" not in content
    assert "[REDACTED]" in content
    # 文件路径必须保留，否则执行端无法定位。
    assert "src/components/Button.tsx" in content
    assert result.prompt.target_files == ["src/components/Button.tsx"]


def test_service_keeps_sensitive_text_when_redaction_disabled() -> None:
    service = PromptService(
        Settings(prompt_provider="mock", redact_sensitive=False),
    )

    result = asyncio.run(service.generate(_sensitive_request()))

    assert "alice@example.com" in result.prompt.content
    assert "[REDACTED]" not in result.prompt.content


# ---------------------------------------------------------------- Ollama


def _ollama_settings(**overrides: Any) -> Settings:
    values: dict[str, Any] = {
        "llm_provider": "ollama",
        "ollama_base_url": "http://127.0.0.1:11434",
        "ollama_model": "qwen2.5:7b",
        "ollama_vision_model": "",
    }
    values.update(overrides)
    return Settings(**values)


def _ollama_handler(
    captured: dict[str, Any],
    *,
    content: str = "src/components/Button.tsx\n\n## 修改任务\n调整按钮。",
) -> Any:
    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["headers"] = dict(request.headers)
        captured["payload"] = json.loads(request.content)
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


def test_ollama_uses_openai_compatible_endpoint_without_auth() -> None:
    captured: dict[str, Any] = {}
    generator = OllamaPromptGenerator(
        _ollama_settings(),
        transport=httpx.MockTransport(_ollama_handler(captured)),
    )

    result = asyncio.run(
        generator.generate(build_prompt_context(_request(), include_image=False))
    )

    assert captured["url"] == "http://127.0.0.1:11434/v1/chat/completions"
    assert "authorization" not in captured["headers"]
    assert captured["payload"]["model"] == "qwen2.5:7b"
    assert captured["payload"]["stream"] is False
    assert result.provider == "ollama"
    assert result.model == "qwen2.5:7b"
    assert result.usage == {
        "prompt_tokens": 10,
        "completion_tokens": 5,
        "total_tokens": 15,
    }


def test_ollama_accepts_base_url_ending_with_v1() -> None:
    captured: dict[str, Any] = {}
    generator = OllamaPromptGenerator(
        _ollama_settings(ollama_base_url="http://127.0.0.1:11434/v1/"),
        transport=httpx.MockTransport(_ollama_handler(captured)),
    )

    asyncio.run(
        generator.generate(build_prompt_context(_request(), include_image=False))
    )

    assert captured["url"] == "http://127.0.0.1:11434/v1/chat/completions"


def test_ollama_uses_vision_model_when_configured() -> None:
    captured: dict[str, Any] = {}
    generator = OllamaPromptGenerator(
        _ollama_settings(ollama_vision_model="qwen2.5vl:7b"),
        transport=httpx.MockTransport(_ollama_handler(captured)),
    )

    result = asyncio.run(
        generator.generate(build_prompt_context(_visual_request(), include_image=True))
    )

    assert captured["payload"]["model"] == "qwen2.5vl:7b"
    user_content = captured["payload"]["messages"][1]["content"]
    assert any(
        part.get("type") == "image_url"
        and part["image_url"]["url"] == TINY_PNG_DATA_URL
        for part in user_content
    )
    assert result.model == "qwen2.5vl:7b"
    assert generator.supports_images is True


def test_ollama_rejects_image_without_vision_model() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise AssertionError("未配置视觉模型时不应发起 HTTP 请求")

    generator = OllamaPromptGenerator(
        _ollama_settings(ollama_vision_model=""),
        transport=httpx.MockTransport(handler),
    )

    with pytest.raises(ApiError) as exc_info:
        asyncio.run(
            generator.generate(
                build_prompt_context(_visual_request(), include_image=True)
            )
        )

    assert exc_info.value.code == "MODEL_UNAVAILABLE"
    assert "OLLAMA_VISION_MODEL" in exc_info.value.message


def test_ollama_requires_model_name() -> None:
    generator = OllamaPromptGenerator(_ollama_settings(ollama_model=""))

    with pytest.raises(ApiError) as exc_info:
        asyncio.run(generator.generate({}))

    assert exc_info.value.code == "MODEL_UNAVAILABLE"
    assert "OLLAMA_MODEL" in exc_info.value.message


def test_ollama_gateway_api_key_adds_bearer_header() -> None:
    captured: dict[str, Any] = {}
    generator = OllamaPromptGenerator(
        _ollama_settings(ollama_api_key="gateway-key"),
        transport=httpx.MockTransport(_ollama_handler(captured)),
    )

    asyncio.run(
        generator.generate(build_prompt_context(_request(), include_image=False))
    )

    assert captured["headers"]["authorization"] == "Bearer gateway-key"


def test_build_prompt_generator_selects_ollama() -> None:
    generator = build_prompt_generator(_ollama_settings())

    assert generator.provider == "ollama"
    assert generator.model == "qwen2.5:7b"
    assert generator.supports_images is False
    # 默认开启脱敏，生成器应被中间件包装。
    assert isinstance(generator, RedactingPromptGenerator)


def test_llm_provider_alias_prefers_new_name(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LLM_PROVIDER", "ollama")
    monkeypatch.setenv("PROMPT_PROVIDER", "deepseek")

    settings = Settings(_env_file=None)

    assert settings.llm_provider == "ollama"
