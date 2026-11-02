"""FastAPI 依赖：本地会话头与 Origin 校验。"""

from __future__ import annotations

from fastapi import Depends, Header, Request

from app.config import Settings, get_settings
from app.core.security import validate_origin, validate_session_token


def session_token(
    x_vibe_session: str | None = Header(default=None, alias="X-Vibe-Session"),
) -> str:
    """校验并返回本地会话标识；失败时抛 SESSION_INVALID。"""
    return validate_session_token(x_vibe_session)


def require_origin(
    request: Request,
    settings: Settings = Depends(get_settings),
) -> str:
    """只允许白名单 origin 调用生成接口。"""
    return validate_origin(request, settings)
