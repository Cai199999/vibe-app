"""系统级接口：健康检查与能力声明。"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends

from app.config import Settings, get_settings

router = APIRouter(tags=["system"])

API_VERSION = "v1"
PROTOCOL_VERSION = "0.1"
SERVICE_NAME = "vibe-prompt-service"


@router.get("/health", summary="L3 健康检查")
def health() -> dict[str, str]:
    """只返回服务存活信息，不暴露依赖与密钥。"""
    return {
        "status": "ok",
        "service": SERVICE_NAME,
        "apiVersion": API_VERSION,
        "protocolVersion": PROTOCOL_VERSION,
        "time": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/capabilities", summary="L3 能力与上限")
def capabilities(
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    """返回模型能力、接口上限与功能开关，供画布启动时对齐。

    顶层 image_base64 始终会被接受：DeepSeek / 配置了视觉模型的 Ollama
    走真实多模态路径，Mock 走本地视觉 Mock。`model.multimodal` 只表示
    是否具备真实识图能力。
    """
    provider = settings.llm_provider.strip().lower()
    if provider == "deepseek":
        model_info = {
            "provider": "deepseek",
            "name": settings.deepseek_model,
            "visionModel": settings.deepseek_vision_model or None,
            "multimodal": bool(settings.deepseek_vision_model),
        }
    elif provider == "ollama":
        vision_model = settings.ollama_vision_model.strip() or None
        model_info = {
            "provider": "ollama",
            "name": settings.ollama_model,
            "visionModel": vision_model,
            "multimodal": vision_model is not None,
        }
    else:
        model_info = {
            "provider": "mock",
            "name": "mock-prompt-v1",
            "visionModel": None,
            "multimodal": False,
        }

    return {
        "apiVersion": API_VERSION,
        "protocolVersion": PROTOCOL_VERSION,
        "model": model_info,
        "limits": {
            "maxSnapshotElements": settings.max_snapshot_elements,
            "maxTextLength": settings.max_text_length,
            "maxNeighbors": settings.max_neighbors,
            "maxSnippetLines": settings.max_snippet_lines,
            "maxSnippetBytes": settings.max_snippet_bytes,
            "maxImageBytes": settings.max_image_bytes,
            "maxImageEdge": settings.max_image_edge,
            "maxPointsPerStroke": settings.max_points_per_stroke,
            "maxRecordedPointsPerStroke": (settings.max_recorded_points_per_stroke),
            "maxAnnotationsPerRequest": settings.max_annotations_per_request,
            "maxRequestBodyBytes": settings.max_request_body_bytes,
            "maxPromptChars": settings.max_prompt_chars,
        },
        "features": {
            "markdownOnly": True,
            "sourceRequired": True,
            "snippetRequired": True,
            "serverHistory": False,
            "streaming": False,
            # 顶层截图输入不受模型能力限制：Mock 可用于本地联调。
            "imageInput": True,
            # 仅视觉标注（visual-draw）必须在顶层 image_base64 存在时使用。
            "visualOnlyAnnotations": True,
            "snapshotFiltersDisplayNone": True,
            # 远程项目开关由根目录 .env 控制，前端据此显示安全警告。
            "allowRemoteProjects": settings.allow_remote_projects,
            # 发送给模型前的文本脱敏是否开启。
            "redactionEnabled": settings.redact_sensitive,
        },
    }
