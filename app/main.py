"""vibe-app FastAPI 入口。

启动方式：
    .venv/bin/uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
"""

from fastapi import FastAPI

from app.config import get_settings

settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    debug=settings.debug,
    description="vibe-app 后端服务",
)


@app.get("/health", tags=["system"], summary="存活探针")
def health() -> dict[str, str]:
    """仅检查进程是否存活，供负载均衡 / 容器编排使用。"""
    return {"status": "ok", "app": settings.app_name, "env": settings.app_env}
