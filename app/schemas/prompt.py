"""L3 Prompt 接口的 Pydantic Schema。

约定：
- 对外字段使用 camelCase，内部 Python 字段使用 snake_case；
- 所有上限与 03.API接口设计.md 对齐；
- 校验失败时尽量抛出带稳定 type 的 PydanticCustomError，
  由 app/core/errors.py 映射为 SOURCE_REQUIRED / SNIPPET_REQUIRED 等错误码。
"""

from __future__ import annotations

import base64
import binascii
import re
from datetime import datetime, timezone
from typing import Any, Literal
from urllib.parse import urlparse

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
    model_validator,
)
from pydantic.alias_generators import to_camel
from pydantic_core import PydanticCustomError

# 与文档默认值一致；服务端还会用 Settings 再做一次更严格的校验。
MAX_TEXT_LENGTH = 200
MAX_NEIGHBORS = 6
MAX_SNIPPET_LINES = 40
MAX_SNIPPET_BYTES = 4096
MAX_IMAGE_BYTES = 1024 * 1024
MAX_IMAGE_EDGE = 1600
MAX_POINTS_PER_STROKE = 100
MAX_ANNOTATIONS_PER_REQUEST = 50

SOURCE_PATTERN = re.compile(
    r"^(?!\/)(?!.*\.\.)(?!.*\\)[A-Za-z0-9._@/-]+\.(jsx|tsx|js|ts):"
    r"[1-9][0-9]*(?::[1-9][0-9]*)?$"
)
ANNOTATION_ID_PATTERN = re.compile(r"^ann_[A-Za-z0-9_-]{1,64}$")
REQUEST_ID_PATTERN = re.compile(r"^req_[A-Za-z0-9_-]{1,64}$")
PROTOCOL_MAJOR = "0"

LOCAL_HOSTS = {"127.0.0.1", "localhost", "::1"}


class CamelModel(BaseModel):
    """统一 camelCase 别名与宽松的未知字段策略。"""

    # 不对字符串做全局 strip：响应中的 Markdown 必须原样返回，
    # 否则末尾换行会被去掉，导致 charCount 与实际内容不一致。
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra="ignore",
    )


class Point(CamelModel):
    """二维坐标点，单位由外层 coordinateSpace 决定。"""

    x: float
    y: float


class Rect(CamelModel):
    """矩形区域；坐标语义由外层字段说明。"""

    x: float
    y: float
    width: float = Field(ge=0)
    height: float = Field(ge=0)


class Stroke(CamelModel):
    """手绘描边样式，仅用于视觉描述，不参与逻辑判断。"""

    color: str = Field(default="#ef4444", min_length=1, max_length=32)
    width: float = Field(default=3, gt=0, le=32)


class ProjectInfo(CamelModel):
    """项目最小上下文，不包含本地绝对路径。"""

    name: str = Field(min_length=1, max_length=100)
    framework: Literal["vite-react"]
    preview_origin: str = Field(min_length=1, max_length=200)

    @field_validator("preview_origin")
    @classmethod
    def _validate_preview_origin(cls, value: str) -> str:
        """MVP 只允许回环地址，避免把接口误用到公网页面。"""
        parsed = urlparse(value)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname:
            raise ValueError("previewOrigin 必须是合法的 http(s) URL")
        if parsed.hostname not in LOCAL_HOSTS:
            raise ValueError("previewOrigin 必须是本机回环地址")
        return value.rstrip("/")


class TruncatedFlags(CamelModel):
    """文本 / 邻居是否被截断。"""

    text: bool = False
    neighbors: bool = False


class Neighbor(CamelModel):
    """目标元素的精简邻居标识。"""

    relation: Literal["parent", "prevSibling", "nextSibling", "firstChild"]
    source: str = Field(min_length=1, max_length=300)
    element_id: str | None = Field(default=None, max_length=64)
    tag: str | None = Field(default=None, max_length=32)
    component: str | None = Field(default=None, max_length=128)
    text: str | None = Field(default=None, max_length=MAX_TEXT_LENGTH)


class Target(CamelModel):
    """被标注目标的结构化投影。"""

    source: str = Field(min_length=1, max_length=300)
    source_kind: Literal["host", "component-usage", "component-root"]
    component: str | None = Field(default=None, max_length=128)
    instance: int = Field(default=0, ge=0, le=100000)
    tag: str | None = Field(default=None, max_length=32)
    text: str | None = Field(default=None, max_length=MAX_TEXT_LENGTH)
    rect: Rect
    coordinate_space: Literal["world"]
    layout: dict[str, str] = Field(default_factory=dict)
    neighbors: list[Neighbor] = Field(default_factory=list, max_length=MAX_NEIGHBORS)
    truncated: TruncatedFlags = Field(default_factory=TruncatedFlags)

    @field_validator("source")
    @classmethod
    def _validate_source(cls, value: str) -> str:
        """空 source 按 SOURCE_REQUIRED 处理；格式错误按普通校验失败处理。"""
        if not value:
            raise PydanticCustomError(
                "source_required",
                "目标缺少 data-source，无法生成可定位的标注。",
            )
        if not SOURCE_PATTERN.fullmatch(value):
            raise ValueError("source 必须符合 相对路径:行号[:列号] 格式")
        return value


class JSXSnippet(CamelModel):
    """选中目标的精简 JSX 片段。"""

    source: str = Field(min_length=1, max_length=300)
    start_line: int = Field(ge=1)
    end_line: int = Field(ge=1)
    content: str = Field(min_length=1)
    truncated: bool = False
    original_line_count: int | None = Field(default=None, ge=1)
    content_hash: str | None = Field(default=None, max_length=128)

    @model_validator(mode="after")
    def _validate_snippet(self) -> "JSXSnippet":
        """校验行号、行数、字节数与空内容。"""
        if self.end_line < self.start_line:
            raise ValueError("endLine 不能小于 startLine")
        if not self.content.strip():
            raise PydanticCustomError(
                "snippet_required",
                "JSX 片段内容为空，已阻止生成 Prompt。",
            )
        line_count = self.content.count("\n") + 1
        if line_count > MAX_SNIPPET_LINES:
            raise PydanticCustomError(
                "request_too_large",
                f"JSX 片段超过 {MAX_SNIPPET_LINES} 行上限。",
            )
        if len(self.content.encode("utf-8")) > MAX_SNIPPET_BYTES:
            raise PydanticCustomError(
                "request_too_large",
                f"JSX 片段超过 {MAX_SNIPPET_BYTES} 字节上限。",
            )
        return self


class Image(CamelModel):
    """用户手动上传的截图；不做自动截屏。"""

    mime: Literal["image/png", "image/webp", "image/jpeg"]
    data_url: str = Field(min_length=1)
    width: int = Field(gt=0)
    height: int = Field(gt=0)
    bytes: int = Field(gt=0)
    cropped_to_target: bool = True

    @model_validator(mode="after")
    def _validate_image(self) -> "Image":
        """校验 data URL、实际解码大小与尺寸。"""
        if self.width > MAX_IMAGE_EDGE or self.height > MAX_IMAGE_EDGE:
            raise PydanticCustomError(
                "image_too_large",
                f"图片最长边不能超过 {MAX_IMAGE_EDGE}px。",
            )
        if self.bytes > MAX_IMAGE_BYTES:
            raise PydanticCustomError(
                "image_too_large",
                f"图片不能超过 {MAX_IMAGE_BYTES} 字节。",
            )

        expected_prefix = f"data:{self.mime};base64,"
        if not self.data_url.startswith(expected_prefix):
            raise ValueError("dataUrl 必须与 mime 匹配的 base64 data URL")

        payload = self.data_url[len(expected_prefix) :]
        try:
            decoded = base64.b64decode(payload, validate=True)
        except (binascii.Error, ValueError) as exc:
            raise ValueError("dataUrl 不是合法的 base64 图片") from exc

        if len(decoded) > MAX_IMAGE_BYTES:
            raise PydanticCustomError(
                "image_too_large",
                f"图片实际大小不能超过 {MAX_IMAGE_BYTES} 字节。",
            )
        return self


class Visual(CamelModel):
    """手绘视觉数据：关键点 + 包围盒 + 空间摘要。"""

    kind: Literal["draw"] = "draw"
    # 不在 Field 上限制长度，改由 model_validator 抛稳定错误码，
    # 保证“超过 100 点”映射为 REQUEST_TOO_LARGE，而不是普通校验失败。
    points: list[Point] = Field(default_factory=list)
    point_count: int = Field(ge=0)
    downsampled_from: int = Field(default=0, ge=0, le=5000)
    bbox: Rect
    stroke: Stroke = Field(default_factory=Stroke)
    related_sources: list[str] = Field(default_factory=list, max_length=20)
    spatial_summary: str = Field(min_length=1, max_length=500)
    image: Image | None = None

    @model_validator(mode="after")
    def _validate_points(self) -> "Visual":
        """点数必须与数组一致；只传 bbox 时允许 points 为空。"""
        if len(self.points) > MAX_POINTS_PER_STROKE:
            raise PydanticCustomError(
                "request_too_large",
                f"关键点不能超过 {MAX_POINTS_PER_STROKE} 个，请先降采样。",
            )
        if self.point_count > MAX_POINTS_PER_STROKE:
            raise PydanticCustomError(
                "request_too_large",
                f"pointCount 不能超过 {MAX_POINTS_PER_STROKE}，请先降采样。",
            )
        if self.point_count != len(self.points):
            raise ValueError("pointCount 必须等于 points 数组长度")
        if self.downsampled_from and self.downsampled_from < self.point_count:
            raise ValueError("downsampledFrom 不能小于 pointCount")
        for source in self.related_sources:
            if not SOURCE_PATTERN.fullmatch(source):
                raise ValueError("relatedSources 中存在非法 source")
        return self


class Drag(CamelModel):
    """拖拽位移意图；只记录，不修改真实 DOM。"""

    kind: Literal["drag"] = "drag"
    start: Point = Field(alias="from")
    end: Point = Field(alias="to")
    delta: Point
    axis: Literal["x", "y", "both"]
    related_sources: list[str] = Field(default_factory=list, max_length=20)
    spatial_summary: str = Field(min_length=1, max_length=500)

    @model_validator(mode="after")
    def _validate_delta(self) -> "Drag":
        """delta 必须与 to - from 一致，避免前端状态错位。"""
        expected_x = self.end.x - self.start.x
        expected_y = self.end.y - self.start.y
        if (
            abs(expected_x - self.delta.x) > 0.01
            or abs(expected_y - self.delta.y) > 0.01
        ):
            raise ValueError("delta 必须等于 to - from")
        return self


class Annotation(CamelModel):
    """单条标注：旁注 / 圈画 / 拖拽。"""

    annotation_id: str
    type: Literal["note", "draw", "drag"]
    intent: str = Field(min_length=1, max_length=2000)
    created_at: datetime
    target: Target | None = None
    jsx_snippet: JSXSnippet | None = None
    visual: Visual | None = None
    drag: Drag | None = None

    @field_validator("annotation_id")
    @classmethod
    def _validate_annotation_id(cls, value: str) -> str:
        if not ANNOTATION_ID_PATTERN.fullmatch(value):
            raise ValueError("annotationId 格式不正确")
        return value

    @model_validator(mode="after")
    def _validate_annotation(self) -> "Annotation":
        """执行 Q9 / Q14 硬校验与类型专属字段校验。"""
        if self.target is None:
            raise PydanticCustomError(
                "source_required",
                "标注缺少目标，无法生成 Prompt。",
            )
        if self.jsx_snippet is None:
            raise PydanticCustomError(
                "snippet_required",
                "标注缺少 JSX 片段，已阻止生成 Prompt。",
            )
        if self.jsx_snippet.source != self.target.source:
            raise PydanticCustomError(
                "snippet_required",
                "JSX 片段的 source 与目标不一致。",
            )

        if self.type == "draw":
            if self.visual is None:
                raise ValueError("draw 标注必须提供 visual")
            if self.drag is not None:
                raise ValueError("draw 标注不能同时提供 drag")
        elif self.type == "drag":
            if self.drag is None:
                raise ValueError("drag 标注必须提供 drag")
            if self.visual is not None:
                raise ValueError("drag 标注不能同时提供 visual")
        elif self.type == "note":
            if self.drag is not None:
                raise ValueError("note 标注不能提供 drag")
        return self


class GenerateOptions(CamelModel):
    """生成选项；上限还会与服务端配置取更严格值。"""

    output_language: Literal["zh-CN", "en"] = "zh-CN"
    max_prompt_chars: int = Field(default=12000, ge=1000, le=20000)


class PromptGenerateRequest(CamelModel):
    """POST /api/v1/prompts/generate 请求体。"""

    request_id: str
    protocol_version: str = Field(min_length=1, max_length=16)
    project: ProjectInfo
    locale: Literal["zh-CN", "en"] = "zh-CN"
    annotations: list[Annotation] = Field(
        min_length=1, max_length=MAX_ANNOTATIONS_PER_REQUEST
    )
    options: GenerateOptions = Field(default_factory=GenerateOptions)

    @field_validator("request_id")
    @classmethod
    def _validate_request_id(cls, value: str) -> str:
        if not REQUEST_ID_PATTERN.fullmatch(value):
            raise ValueError("requestId 格式不正确")
        return value

    @field_validator("protocol_version")
    @classmethod
    def _validate_protocol_version(cls, value: str) -> str:
        """主版本必须兼容；次版本允许向后兼容。"""
        parts = value.split(".")
        if len(parts) != 2 or not all(part.isdigit() for part in parts):
            raise ValueError("protocolVersion 必须为主版本.次版本")
        if parts[0] != PROTOCOL_MAJOR:
            raise ValueError("protocolVersion 主版本不兼容")
        return value

    @model_validator(mode="after")
    def _validate_annotations(self) -> "PromptGenerateRequest":
        """标注 ID 不允许重复，避免结果与目标对应混乱。"""
        ids = [item.annotation_id for item in self.annotations]
        if len(ids) != len(set(ids)):
            raise ValueError("annotationId 不能重复")
        return self


class PromptContent(CamelModel):
    """生成的 Markdown Prompt。"""

    format: Literal["markdown"] = "markdown"
    content: str
    target_files: list[str]
    char_count: int
    truncated: bool = False


class ModelInfo(CamelModel):
    """实际生成 Prompt 的模型信息。"""

    provider: str
    name: str


class Usage(CamelModel):
    """上游模型 token 用量；Mock 模式不返回。"""

    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    total_tokens: int | None = None


class PromptWarning(CamelModel):
    """非致命警告，例如文本截断或图片被忽略。"""

    code: str
    message: str


class PromptResponse(CamelModel):
    """POST /api/v1/prompts/generate 成功响应。"""

    request_id: str
    status: Literal["ok", "partial"]
    prompt: PromptContent
    model_info: ModelInfo = Field(alias="model")
    usage: Usage | None = None
    warnings: list[PromptWarning] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ErrorDetail(CamelModel):
    """错误对象，仅用于文档 / 测试辅助。"""

    code: str
    message: str
    details: dict[str, Any] | None = None
    retryable: bool = False
    request_id: str | None = None
