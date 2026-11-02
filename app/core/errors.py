"""统一错误模型与 FastAPI 异常处理。

设计原则：
- 所有错误响应都使用 03.API接口设计.md 中定义的 code / message / details 结构；
- 不把用户输入、源码片段、图片内容回显到错误信息或日志；
- 业务错误通过 ApiError 主动抛出，Schema 校验错误通过 RequestValidationError 映射。
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)

# Pydantic 自定义错误类型 → 对外错误码 / HTTP 状态码。
# 这些类型在 app/schemas/prompt.py 中通过 PydanticCustomError 抛出。
_CUSTOM_ERROR_MAP: dict[str, tuple[str, int]] = {
    "source_required": ("SOURCE_REQUIRED", 400),
    "snippet_required": ("SNIPPET_REQUIRED", 400),
    "request_too_large": ("REQUEST_TOO_LARGE", 413),
    "image_too_large": ("IMAGE_TOO_LARGE", 413),
}


class ApiError(Exception):
    """可安全返回给客户端的业务异常。"""

    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        *,
        details: dict[str, Any] | None = None,
        retryable: bool = False,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details or {}
        self.retryable = retryable


def _request_id(request: Request) -> str | None:
    """从请求头读取排障 ID；缺失时不伪造。"""
    value = request.headers.get("x-vibe-request-id")
    return value.strip() if value else None


def build_error_payload(
    code: str,
    message: str,
    *,
    details: dict[str, Any] | None = None,
    retryable: bool = False,
    request_id: str | None = None,
) -> dict[str, Any]:
    """构造统一错误响应体。"""
    error: dict[str, Any] = {
        "code": code,
        "message": message,
        "retryable": retryable,
    }
    if details:
        error["details"] = details
    if request_id:
        error["requestId"] = request_id

    payload: dict[str, Any] = {"status": "error", "error": error}
    if request_id:
        payload["requestId"] = request_id
    return payload


def error_response(
    status_code: int,
    code: str,
    message: str,
    *,
    details: dict[str, Any] | None = None,
    retryable: bool = False,
    request_id: str | None = None,
) -> JSONResponse:
    """生成带统一错误结构的 JSONResponse。"""
    return JSONResponse(
        status_code=status_code,
        content=build_error_payload(
            code,
            message,
            details=details,
            retryable=retryable,
            request_id=request_id,
        ),
    )


def _normalize_location(location: tuple[Any, ...]) -> list[str | int]:
    """把 Pydantic 的 loc 转成可 JSON 序列化的列表。"""
    return [part if isinstance(part, int) else str(part) for part in location]


def _map_validation_error(error: dict[str, Any]) -> tuple[str, int]:
    """把 Pydantic 校验错误映射为稳定的对外错误码。"""
    error_type = str(error.get("type", ""))
    if error_type in _CUSTOM_ERROR_MAP:
        return _CUSTOM_ERROR_MAP[error_type]

    location = tuple(error.get("loc", ()))
    lowered = {str(part).lower() for part in location}

    # 缺少 target / source：按“无源码目标”处理，而不是普通字段缺失。
    if "target" in lowered or "source" in lowered:
        if error_type in {"missing", "string_too_short"}:
            return "SOURCE_REQUIRED", 400

    # 缺少 JSX 片段：按 Q14 硬校验处理。
    if "jsx_snippet" in lowered or "jsxsnippet" in lowered:
        if error_type in {"missing", "string_too_short"}:
            return "SNIPPET_REQUIRED", 400

    return "VALIDATION_FAILED", 400


async def _handle_api_error(request: Request, exc: ApiError) -> JSONResponse:
    """业务异常：直接返回预先定义的错误码。"""
    logger.info(
        "api_error code=%s status=%s path=%s",
        exc.code,
        exc.status_code,
        request.url.path,
    )
    return error_response(
        exc.status_code,
        exc.code,
        exc.message,
        details=exc.details,
        retryable=exc.retryable,
        request_id=_request_id(request),
    )


async def _handle_validation_error(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """Schema 校验异常：不返回原始 input，避免泄露文本 / 图片。"""
    errors = exc.errors()
    code, status_code = "VALIDATION_FAILED", 400
    if errors:
        # 优先采用带稳定错误码的自定义错误，避免前面的普通字段错误
        # 掩盖 SOURCE_REQUIRED / SNIPPET_REQUIRED 等硬校验结果。
        selected = next(
            (item for item in errors if str(item.get("type", "")) in _CUSTOM_ERROR_MAP),
            errors[0],
        )
        code, status_code = _map_validation_error(selected)

    fields = [
        {
            "loc": _normalize_location(tuple(item.get("loc", ()))),
            "type": str(item.get("type", "unknown")),
            "message": str(item.get("msg", "参数校验失败")),
        }
        for item in errors
    ]

    return error_response(
        status_code,
        code,
        "请求参数校验失败，请检查标注数据格式。",
        details={"fields": fields},
        request_id=_request_id(request),
    )


async def _handle_unexpected_error(request: Request, exc: Exception) -> JSONResponse:
    """兜底异常：只记录异常类型，不记录请求内容。"""
    logger.exception(
        "unhandled_error type=%s path=%s",
        type(exc).__name__,
        request.url.path,
    )
    return error_response(
        500,
        "INTERNAL_ERROR",
        "服务内部错误，请稍后重试。",
        retryable=True,
        request_id=_request_id(request),
    )


def register_exception_handlers(app: FastAPI) -> None:
    """注册全局异常处理器。"""
    app.add_exception_handler(ApiError, _handle_api_error)
    app.add_exception_handler(RequestValidationError, _handle_validation_error)
    app.add_exception_handler(Exception, _handle_unexpected_error)
