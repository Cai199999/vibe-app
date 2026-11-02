/** 系统能力接口：前端只读取安全开关，不缓存敏感配置。 */

import { PROMPT_API_BASE } from '../lib/constants'

export interface SystemCapabilities {
  features: {
    allowRemoteProjects: boolean
  }
}

/**
 * 读取后端能力声明。
 * 远程项目开关以 FastAPI 的 ALLOW_REMOTE_PROJECTS 为唯一来源，
 * 前端不重复维护 VITE_* 配置，避免两边不一致。
 */
export async function fetchCapabilities(): Promise<SystemCapabilities> {
  const response = await fetch(`${PROMPT_API_BASE}/api/v1/capabilities`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  })
  if (!response.ok) {
    throw new Error(`能力接口返回 ${response.status}`)
  }
  const body: unknown = await response.json()
  if (!body || typeof body !== 'object') {
    throw new Error('能力接口返回格式不正确。')
  }
  return body as SystemCapabilities
}
