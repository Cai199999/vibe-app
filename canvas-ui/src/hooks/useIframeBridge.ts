import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'

import {
  DEFAULT_CANVAS_CONFIG,
  MAX_SNIPPET_BYTES,
  MAX_SNIPPET_LINES,
  PROTOCOL_MAJOR,
  PROTOCOL_VERSION,
} from '../lib/constants'
import { createMessageId, createSessionToken } from '../lib/ids'
import type {
  BridgeError,
  BridgeStatus,
  BridgeTarget,
  ElementsResult,
  HitResult,
  JSXSnippet,
  Rect,
  SnippetResult,
  VibeSnapshot,
} from '../types/vibe'

interface BridgeMessage extends Record<string, unknown> {
  protocolVersion: string
  type: string
  messageId: string
  timestamp: string
  sessionToken?: string
  replyTo?: string
  error?: BridgeError
}

interface PendingRequest {
  resolve: (message: BridgeMessage) => void
  reject: (error: Error) => void
  timer: number
}

export interface IframeBridge {
  iframeRef: RefObject<HTMLIFrameElement | null>
  status: BridgeStatus
  sessionToken: string
  snapshot: VibeSnapshot | null
  lastError: string | null
  hitTest: (
    x: number,
    y: number,
    includeSnippet?: boolean,
    includeContext?: boolean,
  ) => Promise<HitResult>
  elementsInBox: (rect: Rect, includeSnippet?: boolean) => Promise<ElementsResult>
  sourceSnippet: (source: string) => Promise<SnippetResult>
}

const HANDSHAKE_TIMEOUT_MS = 10000

function protocolMajor(version: unknown): string {
  return typeof version === 'string' ? version.split('.')[0] : ''
}

function toError(message: BridgeMessage, fallback: string): Error {
  return new Error(message.error?.message || fallback)
}

function rejectPending(
  pending: Map<string, PendingRequest>,
  reason: string,
): void {
  pending.forEach((request) => {
    window.clearTimeout(request.timer)
    request.reject(new Error(reason))
  })
  pending.clear()
}

/**
 * iframe 桥接。
 *
 * previewOrigin 与 projectKey 同时变化时，说明用户加载了另一个项目：
 * 必须轮换 session、清空快照并拒绝旧项目的在途请求，避免不同项目的
 * 元素/源码片段混入同一条 Prompt。
 */
export function useIframeBridge(
  previewOrigin: string | null,
  projectKey: string | null,
): IframeBridge {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [sessionToken, setSessionToken] = useState(createSessionToken)
  const sessionRef = useRef(sessionToken)
  const readyRef = useRef(false)
  const pendingRef = useRef(new Map<string, PendingRequest>())

  const [status, setStatus] = useState<BridgeStatus>(
    previewOrigin ? 'connecting' : 'idle',
  )
  const [snapshot, setSnapshot] = useState<VibeSnapshot | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)

  const postRaw = useCallback(
    (message: Record<string, unknown>): boolean => {
      const target = iframeRef.current?.contentWindow
      if (!target || !previewOrigin) return false
      // 禁止 "*"：只向当前项目的精确 Origin 发送。
      target.postMessage(message, previewOrigin)
      return true
    },
    [previewOrigin],
  )

  const request = useCallback(
    <T extends BridgeMessage = BridgeMessage>(
      type: string,
      payload: Record<string, unknown> = {},
      timeoutMs = 2500,
    ): Promise<T> => {
      if (!readyRef.current) {
        return Promise.reject(new Error('预览尚未完成握手'))
      }

      const messageId = createMessageId()
      const message: BridgeMessage = {
        protocolVersion: PROTOCOL_VERSION,
        type,
        messageId,
        timestamp: new Date().toISOString(),
        sessionToken: sessionRef.current,
        ...payload,
      }

      return new Promise<T>((resolve, reject) => {
        const timer = window.setTimeout(() => {
          pendingRef.current.delete(messageId)
          reject(new Error(`等待 ${type} 响应超时`))
        }, timeoutMs)

        pendingRef.current.set(messageId, {
          resolve: (response) => resolve(response as T),
          reject,
          timer,
        })

        if (!postRaw(message)) {
          window.clearTimeout(timer)
          pendingRef.current.delete(messageId)
          reject(new Error('iframe 尚未挂载'))
        }
      })
    },
    [postRaw],
  )

  // 项目切换：轮换会话、重置 UI 状态，并启动握手超时提示。
  useEffect(() => {
    readyRef.current = false
    rejectPending(pendingRef.current, '预览项目已切换，原请求已取消')

    const nextToken = createSessionToken()
    sessionRef.current = nextToken
    // 项目切换必须重置外部桥接状态，不能从 props 同步派生。
    // eslint-disable-next-line react/set-state-in-effect
    setSessionToken(nextToken)
    setSnapshot(null)
    setLastError(null)
    setStatus(previewOrigin ? 'connecting' : 'idle')

    if (!previewOrigin) return

    const timer = window.setTimeout(() => {
      if (readyRef.current) return
      setStatus('error')
      setLastError(
        '10 秒内未收到 SDK HELLO：请确认项目使用 Vite、已启用 @vibe/vite-plugin，并检查地址与端口。',
      )
    }, HANDSHAKE_TIMEOUT_MS)

    return () => window.clearTimeout(timer)
  }, [previewOrigin, projectKey])

  useEffect(() => {
    if (!previewOrigin) return
    const pending = pendingRef.current

    const onMessage = (event: MessageEvent) => {
      const frame = iframeRef.current
      if (!frame || event.source !== frame.contentWindow) return
      if (event.origin !== previewOrigin) return

      const data = event.data as BridgeMessage | null
      if (!data || typeof data !== 'object' || typeof data.type !== 'string') {
        return
      }

      if (protocolMajor(data.protocolVersion) !== PROTOCOL_MAJOR) {
        readyRef.current = false
        setStatus('error')
        setLastError('SDK 协议主版本不兼容，请升级 @vibe/vite-plugin。')
        return
      }

      if (data.type === 'HELLO') {
        rejectPending(pendingRef.current, '预览页面重新握手，原请求已取消')
        readyRef.current = true
        setStatus('connected')
        setLastError(null)

        postRaw({
          protocolVersion: PROTOCOL_VERSION,
          type: 'WELCOME',
          messageId: createMessageId(),
          replyTo: data.messageId,
          timestamp: new Date().toISOString(),
          hostOrigin: window.location.origin,
          sessionToken: sessionRef.current,
          config: DEFAULT_CANVAS_CONFIG,
        })
        return
      }

      // WELCOME 之后的所有消息都必须带正确 token。
      if (data.sessionToken !== sessionRef.current) return

      if (data.type === 'SNAPSHOT') {
        if (Array.isArray(data.elements) && data.meta) {
          setSnapshot(data as unknown as VibeSnapshot)
        }
        return
      }

      if (data.type === 'ERROR') {
        setLastError(data.error?.message || 'SDK 返回协议错误')
        // 协议级错误也可能带 replyTo，继续向下让对应请求失败。
      }

      if (data.replyTo) {
        const pending = pendingRef.current.get(data.replyTo)
        if (!pending) return
        window.clearTimeout(pending.timer)
        pendingRef.current.delete(data.replyTo)

        if (data.error) {
          pending.reject(toError(data, 'SDK 请求失败'))
        } else {
          pending.resolve(data)
        }
      }
    }

    window.addEventListener('message', onMessage)
    return () => {
      window.removeEventListener('message', onMessage)
      rejectPending(pending, '画布已卸载')
      readyRef.current = false
    }
  }, [previewOrigin, postRaw])

  // 15 秒心跳；连续失败时标记断线，由用户切换/重新加载项目恢复。
  useEffect(() => {
    if (!previewOrigin) return
    const timer = window.setInterval(() => {
      if (!readyRef.current) return
      request('PING', {}, 1500).catch(() => {
        readyRef.current = false
        setStatus('error')
        setLastError('iframe 心跳超时，请重新加载项目或检查 dev server。')
      })
    }, 15000)

    return () => window.clearInterval(timer)
  }, [previewOrigin, request])

  const hitTest = useCallback(
    async (
      x: number,
      y: number,
      includeSnippet = true,
      includeContext = true,
    ): Promise<HitResult> => {
      const message = await request('HIT_TEST', {
        x,
        y,
        includeSnippet,
        includeContext,
      })
      return {
        hit: Boolean(message.hit),
        target: (message.target as BridgeTarget | null) ?? null,
        jsxSnippet: message.jsxSnippet as JSXSnippet | undefined,
        error: message.error,
      }
    },
    [request],
  )

  const elementsInBox = useCallback(
    async (rect: Rect, includeSnippet = false): Promise<ElementsResult> => {
      const message = await request('ELEMENTS_IN_BOX', {
        rect,
        coordinateSpace: 'iframe-viewport',
        limit: 50,
        includeSnippet,
      })
      return {
        truncated: Boolean(message.truncated),
        elements: Array.isArray(message.elements)
          ? (message.elements as BridgeTarget[])
          : [],
        error: message.error,
      }
    },
    [request],
  )

  const sourceSnippet = useCallback(
    async (source: string): Promise<SnippetResult> => {
      const message = await request('SOURCE_SNIPPET_REQUEST', {
        source,
        maxLines: MAX_SNIPPET_LINES,
        maxBytes: MAX_SNIPPET_BYTES,
      })
      return {
        found: Boolean(message.found) && Boolean(message.jsxSnippet),
        jsxSnippet: (message.jsxSnippet as JSXSnippet | null) ?? null,
        error: message.error,
      }
    },
    [request],
  )

  return {
    iframeRef,
    status,
    sessionToken,
    snapshot,
    lastError,
    hitTest,
    elementsInBox,
    sourceSnippet,
  }
}
