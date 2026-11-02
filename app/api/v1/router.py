"""API v1 路由汇总。"""

from fastapi import APIRouter

from app.api.v1 import prompts, system

router = APIRouter()
router.include_router(system.router)
router.include_router(prompts.router)
