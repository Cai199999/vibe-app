"""Prompt 生成业务编排：限额、上下文投影、输出校验。

服务无状态：
- 不保存请求、标注、片段、图片或 Prompt；
- 不读取用户源码文件；
- 只记录脱敏日志。
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone

from app.config import Settings
from app.core.errors import ApiError
from app.schemas.prompt import (
    Annotation,
    ModelInfo,
    PromptContent,
    PromptGenerateRequest,
    PromptResponse,
    PromptWarning,
    Usage,
)
from app.services.prompt_context import build_prompt_context
from app.services.prompt_generator import (
    GeneratedPrompt,
    PromptGenerator,
    build_prompt_generator,
)

logger = logging.getLogger(__name__)

# 输出中禁止出现的补丁 / 危险片段。
_FORBIDDEN_OUTPUT_PATTERNS = (
    re.compile(r"```diff\b", re.IGNORECASE),
    re.compile(r"^---\s+a/", re.MULTILINE),
    re.compile(r"^\+\+\+\s+b/", re.MULTILINE),
    re.compile(r"^@@", re.MULTILINE),
    re.compile(r"<script\b", re.IGNORECASE),
    re.compile(r"javascript:", re.IGNORECASE),
)

_CODE_BLOCK_PATTERN = re.compile(r"```[^\n]*\n(.*?)```", re.DOTALL)
_MAX_CODE_BLOCK_LINES = 80


def _target_file(source: str) -> str:
    """从 source 中提取文件路径。"""
    return source.split(":", 1)[0]


def _collect_target_files(request: PromptGenerateRequest) -> list[str]:
    """按出现顺序去重目标文件。"""
    files: list[str] = []
    for annotation in request.annotations:
        if annotation.target is None:
            continue
        path = _target_file(annotation.target.source)
        if path not in files:
            files.append(path)
    return files


def _truncate_prompt(content: str, max_chars: int) -> tuple[str, bool]:
    """按字符上限截断，并给出明确提示。"""
    if len(content) <= max_chars:
        return content, False
    suffix = "\n\n> 提示：输出已达到长度上限，后续内容已截断。\n"
    return content[: max(0, max_chars - len(suffix))].rstrip() + suffix, True


def _validate_output(content: str, target_files: list[str]) -> None:
    """校验模型输出形态，拒绝 Diff / 整文件重写 / 危险 HTML。"""
    if not content.strip():
        raise ApiError(
            502,
            "OUTPUT_INVALID",
            "模型返回了空 Prompt。",
            retryable=True,
        )

    for pattern in _FORBIDDEN_OUTPUT_PATTERNS:
        if pattern.search(content):
            raise ApiError(
                502,
                "OUTPUT_INVALID",
                "模型输出包含 Diff、补丁或危险 HTML，已拒绝返回。",
                retryable=True,
            )

    for block in _CODE_BLOCK_PATTERN.findall(content):
        if len(block.splitlines()) > _MAX_CODE_BLOCK_LINES:
            raise ApiError(
                502,
                "OUTPUT_INVALID",
                "模型输出了过长的代码块，疑似整文件重写，已拒绝返回。",
                retryable=True,
            )

    if target_files and not any(path in content for path in target_files):
        raise ApiError(
            502,
            "OUTPUT_INVALID",
            "模型输出未包含任何目标文件路径。",
            retryable=True,
        )


class PromptService:
    """L3 生成服务。"""

    def __init__(
        self,
        settings: Settings,
        generator: PromptGenerator | None = None,
    ) -> None:
        self.settings = settings
        self.generator = generator or build_prompt_generator(settings)

    def _validate_limits(self, request: PromptGenerateRequest) -> None:
        """在调用模型前做服务端硬校验，避免把无效请求发给上游。"""
        if len(request.annotations) > self.settings.max_annotations_per_request:
            raise ApiError(
                413,
                "REQUEST_TOO_LARGE",
                "标注数量超过服务端上限。",
                details={"maxAnnotations": self.settings.max_annotations_per_request},
            )

        if request.options.max_prompt_chars > self.settings.max_prompt_chars:
            raise ApiError(
                400,
                "VALIDATION_FAILED",
                "maxPromptChars 超过服务端上限。",
                details={"maxPromptChars": self.settings.max_prompt_chars},
            )

        for annotation in request.annotations:
            self._validate_annotation_limits(annotation)

    def _validate_annotation_limits(self, annotation: Annotation) -> None:
        """逐条校验文本、邻居、片段、图片与点位上限。"""
        target = annotation.target
        assert target is not None  # Schema 已校验

        if target.text and len(target.text) > self.settings.max_text_length:
            raise ApiError(
                400,
                "VALIDATION_FAILED",
                "目标文本超过服务端上限，请先截断。",
            )
        if len(target.neighbors) > self.settings.max_neighbors:
            raise ApiError(
                400,
                "VALIDATION_FAILED",
                "邻居数量超过服务端上限。",
            )

        snippet = annotation.jsx_snippet
        assert snippet is not None  # Schema 已校验
        if snippet.content.count("\n") + 1 > self.settings.max_snippet_lines:
            raise ApiError(
                413,
                "REQUEST_TOO_LARGE",
                "JSX 片段行数超过服务端上限。",
            )
        if len(snippet.content.encode("utf-8")) > self.settings.max_snippet_bytes:
            raise ApiError(
                413,
                "REQUEST_TOO_LARGE",
                "JSX 片段字节数超过服务端上限。",
            )

        visual = annotation.visual
        if visual is not None:
            if visual.point_count > self.settings.max_points_per_stroke:
                raise ApiError(
                    413,
                    "REQUEST_TOO_LARGE",
                    "手绘关键点数量超过服务端上限，请先降采样。",
                    details={"maxPoints": self.settings.max_points_per_stroke},
                )
            image = visual.image
            if image is not None:
                if image.bytes > self.settings.max_image_bytes:
                    raise ApiError(
                        413,
                        "IMAGE_TOO_LARGE",
                        "图片大小超过服务端上限。",
                    )
                if (
                    image.width > self.settings.max_image_edge
                    or image.height > self.settings.max_image_edge
                ):
                    raise ApiError(
                        413,
                        "IMAGE_TOO_LARGE",
                        "图片尺寸超过服务端上限。",
                    )

    def _collect_warnings(
        self, request: PromptGenerateRequest, include_image: bool
    ) -> list[PromptWarning]:
        """收集非致命警告，不改变主流程。"""
        codes: list[str] = []

        def add(code: str) -> None:
            if code not in codes:
                codes.append(code)

        for annotation in request.annotations:
            target = annotation.target
            if target and target.truncated.text:
                add("TEXT_TRUNCATED")
            if target and target.truncated.neighbors:
                add("NEIGHBORS_TRUNCATED")
            if annotation.jsx_snippet and annotation.jsx_snippet.truncated:
                add("SNIPPET_TRUNCATED")
            if (
                annotation.visual
                and annotation.visual.image is not None
                and not include_image
            ):
                add("IMAGE_IGNORED_MODEL_NO_VISION")

        messages = {
            "TEXT_TRUNCATED": "部分目标文本已截断。",
            "NEIGHBORS_TRUNCATED": "部分邻居列表已截断。",
            "SNIPPET_TRUNCATED": "部分 JSX 片段已截断。",
            "IMAGE_IGNORED_MODEL_NO_VISION": ("当前模型不支持图片输入，已忽略截图。"),
            "PROMPT_TRUNCATED": "Prompt 达到长度上限，已截断。",
        }
        return [PromptWarning(code=code, message=messages[code]) for code in codes]

    async def generate(self, request: PromptGenerateRequest) -> PromptResponse:
        """执行一次完整的 Prompt 生成。"""
        self._validate_limits(request)

        include_image = self.generator.supports_images
        warnings = self._collect_warnings(request, include_image)
        context = build_prompt_context(request, include_image=include_image)

        generated: GeneratedPrompt = await self.generator.generate(context)

        max_chars = min(
            request.options.max_prompt_chars, self.settings.max_prompt_chars
        )
        content, truncated = _truncate_prompt(generated.content, max_chars)
        if truncated:
            warnings.append(
                PromptWarning(
                    code="PROMPT_TRUNCATED",
                    message="Prompt 达到长度上限，已截断。",
                )
            )

        target_files = _collect_target_files(request)
        _validate_output(content, target_files)

        usage = Usage(**generated.usage) if generated.usage else None
        response = PromptResponse(
            request_id=request.request_id,
            status="partial" if warnings else "ok",
            prompt=PromptContent(
                content=content,
                target_files=target_files,
                char_count=len(content),
                truncated=truncated,
            ),
            model_info=ModelInfo(
                provider=generated.provider,
                name=generated.model,
            ),
            usage=usage,
            warnings=warnings,
            created_at=datetime.now(timezone.utc),
        )

        logger.info(
            "prompt_generated request_id=%s annotations=%d target_files=%d "
            "provider=%s status=%s prompt_chars=%d",
            request.request_id,
            len(request.annotations),
            len(target_files),
            generated.provider,
            response.status,
            len(content),
        )
        return response
