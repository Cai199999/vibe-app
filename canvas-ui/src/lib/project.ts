import type { LocalProject } from '../types/vibe'

const LAST_PROJECT_KEY = 'vibe.lastProjectUrl'

/** 读取上次加载的项目地址；只用于预填输入框，不会自动连接。 */
export function getLastProjectUrl(): string {
  try {
    return window.localStorage.getItem(LAST_PROJECT_KEY) ?? ''
  } catch {
    return ''
  }
}

export function rememberProjectUrl(url: string): void {
  try {
    window.localStorage.setItem(LAST_PROJECT_KEY, url)
  } catch {
    // 隐私模式下 localStorage 可能不可写；不影响当前会话。
  }
}

/**
 * 解析用户输入的本地 Vite 地址。
 *
 * - 补全 http://；
 * - 只允许 http(s)，拒绝 javascript: / file: 等危险协议；
 * - Origin 由 URL 解析得出，后续 postMessage 精确使用它，不使用 "*"。
 */
export function parseProjectUrl(raw: string): LocalProject {
  const trimmed = raw.trim()
  if (!trimmed) {
    throw new Error('请输入本地项目地址。')
  }

  const candidate = /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(trimmed)
    ? trimmed
    : `http://${trimmed}`

  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    throw new Error('地址格式不正确，例如 http://localhost:5173。')
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('只支持 http:// 或 https:// 地址。')
  }
  if (!url.hostname) {
    throw new Error('地址缺少主机名。')
  }

  // L3 Prompt 服务只接受本机回环地址，提前在加载处阻断，避免画布连上后
  // 到生成阶段才因 previewOrigin 校验失败。
  const localHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])
  if (!localHosts.has(url.hostname)) {
    throw new Error('当前仅支持本机地址：localhost、127.0.0.1 或 ::1。')
  }

  const hostLabel = url.host
  const lastSegment = url.pathname
    .split('/')
    .filter(Boolean)
    .pop()
  const projectName = lastSegment
    ? decodeURIComponent(lastSegment)
    : hostLabel

  return {
    id: `prj_${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2, 12)}`,
    name: projectName.slice(0, 80),
    url: url.toString(),
    origin: url.origin,
    loadedAt: new Date().toISOString(),
  }
}

/**
 * 在 iframe 地址上附加画布 Origin。
 *
 * SDK 只接受该 Origin 的 WELCOME 与后续消息；不依赖 document.referrer，
 * 这样可以兼容 referrer-policy 较严格的用户项目。
 */
export function withVibeHost(url: string, hostOrigin: string): string {
  const target = new URL(url)
  target.searchParams.set('__vibe_host', hostOrigin)
  return target.toString()
}
