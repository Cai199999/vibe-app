"""本地接口的轻量安全校验。

说明：
- 这里不是账号体系，只做本机回环场景下的误调用 / CSRF 防护；
- Origin 与自定义会话头配合 CORS 使用，不使用 cookie；
- 不记录会话 token 原文。
"""

from __future__ import annotations

import re

from fastapi import Request

from app.config import Settings
from app.core.errors import ApiError

# 与 03.API接口设计.md 6.2 保持一致。
SESSION_PATTERN = re.compile(r"^st_[A-Za-z0-9_-]{8,64}$")
REQUEST_ID_PATTERN = re.compile(r"^req_[A-Za-z0-9_-]{1,64}$")


def validate_session_token(token: str | None) -> str:
    """校验 X-Vibe-Session 格式；缺失或非法统一返回 SESSION_INVALID。"""
    if not token or not SESSION_PATTERN.fullmatch(token):
        raise ApiError(
            401,
            "SESSION_INVALID",
            "缺少或非法的 X-Vibe-Session 会话头。",
        )
    return token


def validate_origin(request: Request, settings: Settings) -> str:
    """校验浏览器 Origin；本地 POST 必须来自白名单。"""
    origin = request.headers.get("origin")
    if not origin:
        raise ApiError(
            403,
            "ORIGIN_NOT_ALLOWED",
            "缺少 Origin 请求头，仅允许本地画布工具调用。",
        )
    if origin not in settings.allowed_origin_list:
        raise ApiError(
            403,
            "ORIGIN_NOT_ALLOWED",
            "当前 Origin 不在本地白名单中。",
            details={"origin": origin},
        )
    return origin


def validate_request_id(header_value: str | None, body_value: str) -> str:
    """校验请求头与请求体中的 requestId 一致。"""
    if not header_value:
        raise ApiError(
            400,
            "INVALID_REQUEST",
            "缺少 X-Vibe-Request-Id 请求头。",
        )
    if not REQUEST_ID_PATTERN.fullmatch(header_value):
        raise ApiError(
            400,
            "INVALID_REQUEST",
            "X-Vibe-Request-Id 格式不正确。",
        )
    if header_value != body_value:
        raise ApiError(
            400,
            "VALIDATION_FAILED",
            "请求头与请求体中的 requestId 不一致。",
            details={"header": header_value, "body": body_value},
        )
    return header_value
