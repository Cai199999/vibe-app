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

/** 与后端 app/core/preview_origin.py 的 BLOCKED_PREVIEW_PORTS 保持一致。 */
const BLOCKED_PREVIEW_PORTS = new Set([
  22, // SSH
  2375, // Docker daemon
  2376, // Docker daemon TLS
  3306, // MySQL
  5432, // PostgreSQL
  5672, // RabbitMQ
  6379, // Redis
  8000, // Vibe FastAPI
  9000, // MinIO API
  9001, // MinIO Console
  9200, // Elasticsearch
  11211, // Memcached
  15672, // RabbitMQ Management
  27017, // MongoDB
])

const HOST_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i

export interface ProjectUrlOptions {
  /** true：允许任意合法 Host；false：仅本机；null：开关尚未读取。 */
  allowRemoteProjects: boolean | null
}

function toHttpUrl(raw: string): URL {
  const trimmed = raw.trim()
  if (!trimmed) {
    throw new Error('请输入项目地址。')
  }
  const candidate = /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(trimmed)
    ? trimmed
    : `http://${trimmed}`
  try {
    return new URL(candidate)
  } catch {
    throw new Error('地址格式不正确，例如 http://localhost:5173。')
  }
}

function canonicalHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/\.$/, '')
}

function isValidIpv4(host: string): boolean {
  const parts = host.split('.')
  return (
    parts.length === 4 &&
    parts.every(
      (part) => /^\d{1,3}$/.test(part) && Number(part) <= 255,
    )
  )
}

/** Host 只允许 IPv4、IPv6 字面量或合法域名标签。 */
function isValidHostname(hostname: string): boolean {
  const host = canonicalHostname(hostname)
  if (!host || host.length > 253) return false

  // URL 构造器已经校验过方括号 IPv6 的语法。
  if (host.startsWith('[') && host.endsWith(']')) return true
  if (host.includes(':')) return false
  if (isValidIpv4(host)) return true

  const labels = host.split('.')
  if (labels.some((label) => !HOST_LABEL.test(label))) return false
  // 纯数字顶级域不是合法域名，通常是写错的 IPv4。
  return !/^\d+$/.test(labels[labels.length - 1])
}

function isLocalHostname(hostname: string): boolean {
  const host = canonicalHostname(hostname)
  if (host === 'localhost' || host.endsWith('.localhost')) return true
  if (host === '[::1]') return true
  if (isValidIpv4(host)) return host.split('.')[0] === '127'
  return false
}

/**
 * 用户当前输入的是否为非本机地址。
 * 只用于显示安全警告，不替代提交时的完整校验。
 */
export function isRemoteProjectAddress(raw: string): boolean {
  try {
    const url = toHttpUrl(raw)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
    return Boolean(url.hostname) && !isLocalHostname(url.hostname)
  } catch {
    return false
  }
}

/**
 * 解析用户输入的 Vite 项目地址。
 *
 * - 补全 http://；
 * - 只允许 http(s)，拒绝 javascript: / file: 等危险协议；
 * - 默认只允许回环地址；服务端开关开启后可加载任意合法 Host；
 * - 始终拒绝用户名 / 密码与基础设施 / 管理端口；
 * - Origin 由 URL 解析得出，后续 postMessage 精确使用它，不使用 "*"。
 */
export function parseProjectUrl(
  raw: string,
  options: ProjectUrlOptions = { allowRemoteProjects: false },
): LocalProject {
  const url = toHttpUrl(raw)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('只支持 http:// 或 https:// 地址。')
  }
  if (url.username || url.password) {
    throw new Error('项目地址不能包含用户名或密码。')
  }
  if (!url.hostname || !isValidHostname(url.hostname)) {
    throw new Error('地址中的 Host 格式不正确。')
  }

  const defaultPort = url.protocol === 'https:' ? 443 : 80
  const port = url.port ? Number(url.port) : defaultPort
  if (url.port && (!Number.isInteger(port) || port < 1)) {
    throw new Error('地址中的端口必须是 1-65535 的整数。')
  }
  if (BLOCKED_PREVIEW_PORTS.has(port)) {
    throw new Error(
      `不允许加载基础设施或管理端口 ${port}，请填写 Vite dev server 地址。`,
    )
  }

  if (!isLocalHostname(url.hostname)) {
    if (options.allowRemoteProjects === false) {
      throw new Error(
        '远程项目加载已关闭。请在根目录 .env 设置 ALLOW_REMOTE_PROJECTS=true 并重启 FastAPI。',
      )
    }
    if (options.allowRemoteProjects === null) {
      throw new Error(
        '暂时无法读取远程加载开关，请确认 FastAPI 已启动后刷新页面重试。',
      )
    }
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
