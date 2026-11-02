"""vibe-app FastAPI 入口。

启动方式：
    .venv/bin/uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

安全边界：
- 只监听回环地址；
- CORS 使用精确白名单，不允许通配符；
- 不启用 credentials，不使用 cookie。
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import router as api_v1_router
from app.config import get_settings
from app.core.errors import register_exception_handlers
from app.core.middleware import BodySizeLimitMiddleware

settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    debug=settings.debug,
    description="vibe-app 后端服务（L3 Prompt HTTP API）",
)

# 先加体积限制，再加 CORS：后添加的中间件位于更外层，
# 保证预检请求先被 CORS 处理，普通请求仍经过体积检查。
app.add_middleware(
    BodySizeLimitMiddleware,
    max_bytes=settings.max_request_body_bytes,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origin_list,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=[
        "Content-Type",
        "X-Vibe-Session",
        "X-Vibe-Request-Id",
        "X-Vibe-Protocol-Version",
    ],
    expose_headers=["X-Vibe-Request-Id"],
    max_age=600,
)

register_exception_handlers(app)
app.include_router(api_v1_router, prefix="/api/v1")


@app.get("/health", tags=["system"], summary="存活探针")
def health() -> dict[str, str]:
    """仅检查进程是否存活，供负载均衡 / 容器编排使用。"""
    return {"status": "ok", "app": settings.app_name, "env": settings.app_env}
