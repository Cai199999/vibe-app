import { PROMPT_API_BASE } from '../lib/constants'
import type {
  ApiErrorPayload,
  PromptGenerateRequest,
  PromptResponse,
} from '../types/vibe'

export class PromptApiError extends Error {
  readonly code: string
  readonly details?: Record<string, unknown>
  readonly httpStatus?: number
  readonly requestId?: string

  constructor(
    message: string,
    options: {
      code?: string
      details?: Record<string, unknown>
      httpStatus?: number
      requestId?: string
    } = {},
  ) {
    super(message)
    this.name = 'PromptApiError'
    this.code = options.code ?? 'NETWORK_ERROR'
    this.details = options.details
    this.httpStatus = options.httpStatus
    this.requestId = options.requestId
  }
}

function isErrorPayload(value: unknown): value is ApiErrorPayload {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<ApiErrorPayload>
  return (
    candidate.status === 'error' &&
    Boolean(candidate.error) &&
    typeof candidate.error?.code === 'string'
  )
}

/**
 * 调用 L3 生成接口。
 * 请求头与请求体 requestId 必须一致；会话 token 只存在内存中。
 */
export async function generatePrompt(
  payload: PromptGenerateRequest,
  sessionToken: string,
): Promise<PromptResponse> {
  let response: Response
  try {
    response = await fetch(`${PROMPT_API_BASE}/api/v1/prompts/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Vibe-Session': sessionToken,
        'X-Vibe-Request-Id': payload.requestId,
      },
      body: JSON.stringify(payload),
    })
  } catch {
    throw new PromptApiError(
      '无法连接 Prompt 服务，请确认 FastAPI 已在 127.0.0.1:8000 启动。',
      { code: 'NETWORK_ERROR' },
    )
  }

  let body: unknown = null
  try {
    body = await response.json()
  } catch {
    throw new PromptApiError('Prompt 服务返回了无法解析的响应。', {
      code: 'INVALID_RESPONSE',
      httpStatus: response.status,
    })
  }

  if (!response.ok || isErrorPayload(body)) {
    if (isErrorPayload(body)) {
      throw new PromptApiError(body.error.message, {
        code: body.error.code,
        details: body.error.details,
        httpStatus: response.status,
        requestId: body.requestId,
      })
    }
    throw new PromptApiError('Prompt 服务请求失败。', {
      code: 'HTTP_ERROR',
      httpStatus: response.status,
    })
  }

  return body as PromptResponse
}
