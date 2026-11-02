"""HTTP 中间件：请求体大小限制。"""

from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from app.core.errors import error_response


class BodySizeLimitMiddleware(BaseHTTPMiddleware):
    """在解析 JSON 前拒绝过大的请求体，避免无意义的解码开销。"""

    def __init__(self, app, *, max_bytes: int) -> None:
        super().__init__(app)
        self.max_bytes = max_bytes

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        if request.method in {"POST", "PUT", "PATCH"}:
            raw_length = request.headers.get("content-length")
            if raw_length:
                try:
                    content_length = int(raw_length)
                except ValueError:
                    content_length = 0
                if content_length > self.max_bytes:
                    return error_response(
                        413,
                        "REQUEST_TOO_LARGE",
                        "请求体超过本地服务限制。",
                        details={"maxBytes": self.max_bytes},
                        request_id=request.headers.get("x-vibe-request-id"),
                    )
        return await call_next(request)
