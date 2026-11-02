"""L3 Prompt 生成接口。"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Header, Response

from app.api.deps import require_origin, session_token
from app.config import Settings, get_settings
from app.core.security import validate_request_id
from app.schemas.prompt import PromptGenerateRequest, PromptResponse
from app.services.prompt_service import PromptService

router = APIRouter(prefix="/prompts", tags=["prompts"])


@router.post(
    "/generate",
    response_model=PromptResponse,
    response_model_by_alias=True,
    summary="生成 Markdown Prompt",
)
async def generate_prompt(
    payload: PromptGenerateRequest,
    response: Response,
    _origin: str = Depends(require_origin),
    _session: str = Depends(session_token),
    x_vibe_request_id: str | None = Header(default=None, alias="X-Vibe-Request-Id"),
    settings: Settings = Depends(get_settings),
) -> PromptResponse:
    """接收结构化标注上下文，返回可复制到 Cursor 的 Markdown。

    安全与幂等：
    - Origin / X-Vibe-Session 在依赖中校验；
    - requestId 只用于排障，不做服务端去重；
    - 生成中由前端禁用提交按钮。
    """
    validate_request_id(x_vibe_request_id, payload.request_id)

    service = PromptService(settings)
    result = await service.generate(payload)

    response.headers["X-Vibe-Request-Id"] = payload.request_id
    return result
