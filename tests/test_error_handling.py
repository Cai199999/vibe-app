"""异常处理器日志安全测试。

生产日志只允许记录异常类型与请求路径；
异常消息、请求正文和 Prompt 片段都不能进入日志或响应体。
"""

from __future__ import annotations

import logging

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.errors import register_exception_handlers

SENSITIVE_MESSAGE = "password=hunter2 alice@example.com 13800138000"


def _boom_app() -> FastAPI:
    app = FastAPI()
    register_exception_handlers(app)

    @app.get("/boom")
    async def boom() -> None:
        raise RuntimeError(SENSITIVE_MESSAGE)

    return app


def test_unexpected_error_logs_only_safe_fields(
    caplog: pytest.LogCaptureFixture,
) -> None:
    app = _boom_app()

    with caplog.at_level(logging.ERROR):
        with TestClient(app, raise_server_exceptions=False) as client:
            response = client.get("/boom")

    assert response.status_code == 500
    assert response.json()["error"]["code"] == "INTERNAL_ERROR"
    assert SENSITIVE_MESSAGE not in response.text

    log_text = caplog.text
    assert "unhandled_error type=RuntimeError path=/boom" in log_text
    assert "hunter2" not in log_text
    assert "alice@example.com" not in log_text
    assert "13800138000" not in log_text
    # 不使用 logger.exception，因此不应附带 traceback。
    assert "Traceback" not in log_text
