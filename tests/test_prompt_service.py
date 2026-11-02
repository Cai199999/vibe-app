"""Prompt 服务层测试：上下文最小化、输出约束与上游错误映射。"""

from __future__ import annotations

import asyncio
from typing import Any

import pytest

from app.config import Settings
from app.core.errors import ApiError
from app.schemas.prompt import PromptGenerateRequest
from app.services.prompt_context import build_prompt_context
from app.services.prompt_generator import (
    DeepSeekPromptGenerator,
    GeneratedPrompt,
)
from app.services.prompt_service import PromptService

SOURCE = "src/components/Button.tsx:12:5"


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
