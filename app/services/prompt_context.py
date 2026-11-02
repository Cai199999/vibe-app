"""把 L3 请求投影成模型上下文。

关键边界：
- 原始手绘点数组不进入模型上下文；
- 只保留 bbox、关键点数量、空间摘要与关联 source；
- 图片仅在模型支持多模态且用户手动上传时附加。
"""

from __future__ import annotations

from typing import Any

from app.schemas.prompt import Annotation, PromptGenerateRequest


def _target_payload(annotation: Annotation) -> dict[str, Any] | None:
    """目标投影：保留定位、文本、布局与邻居，不含原始 DOM。"""
    if annotation.target is None:
        return None
    return annotation.target.model_dump(by_alias=True, exclude_none=True)


def _snippet_payload(annotation: Annotation) -> dict[str, Any] | None:
    """片段投影：只包含选中目标的精简 JSX。"""
    if annotation.jsx_snippet is None:
        return None
    return annotation.jsx_snippet.model_dump(by_alias=True, exclude_none=True)


def _visual_payload(
    annotation: Annotation, *, include_image: bool
) -> dict[str, Any] | None:
    """视觉投影：丢弃原始点数组，只保留空间描述。"""
    visual = annotation.visual
    if visual is None:
        return None

    payload: dict[str, Any] = {
        "kind": visual.kind,
        "bbox": visual.bbox.model_dump(by_alias=True),
        "pointCount": visual.point_count,
        "downsampledFrom": visual.downsampled_from,
        "stroke": visual.stroke.model_dump(by_alias=True),
        "relatedSources": visual.related_sources,
        "spatialSummary": visual.spatial_summary,
    }
    if include_image and visual.image is not None:
        payload["image"] = visual.image.model_dump(by_alias=True)
    return payload


def _drag_payload(annotation: Annotation) -> dict[str, Any] | None:
    """拖拽投影：只表达位移意图。"""
    drag = annotation.drag
    if drag is None:
        return None
    return drag.model_dump(by_alias=True, exclude_none=True)


def build_prompt_context(
    request: PromptGenerateRequest, *, include_image: bool
) -> dict[str, Any]:
    """构造发送给生成器的结构化上下文。"""
    annotations: list[dict[str, Any]] = []
    for annotation in request.annotations:
        annotations.append(
            {
                "annotationId": annotation.annotation_id,
                "type": annotation.type,
                "intent": annotation.intent,
                "target": _target_payload(annotation),
                "jsxSnippet": _snippet_payload(annotation),
                "visual": _visual_payload(annotation, include_image=include_image),
                "drag": _drag_payload(annotation),
            }
        )

    context: dict[str, Any] = {
        "protocolVersion": request.protocol_version,
        "project": request.project.model_dump(by_alias=True),
        "locale": request.locale,
        "options": request.options.model_dump(by_alias=True),
        "annotations": annotations,
    }
    # 顶层截图只在本次调用内存在；生成器会把它从文本 JSON 中剥离，
    # 以 image_url 形式交给多模态模型，避免重复传输超大 base64。
    if include_image and request.image_base64:
        context["imageDataUrl"] = request.image_base64
    return context
