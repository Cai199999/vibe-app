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
import { VISUAL_MODE_STATUS_MESSAGE } from '../lib/messages'
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

/** 源码模式探测窗口：超时后自动降级为仅视觉模式。 */
const HANDSHAKE_TIMEOUT_MS = 3000

const VISUAL_FALLBACK_DETAIL =
  `${VISUAL_MODE_STATUS_MESSAGE}` +
  '点击元素不可用；请上传或粘贴截图后圈画，使用视觉模型生成 Prompt。'

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
  const handshakeTimerRef = useRef<number | null>(null)
  const helloSucceededRef = useRef(false)
  const snapshotReadyRef = useRef(false)
  /** 本次项目加载是否已经降级；降级后不再接受迟到的握手。 */
  const fallbackRef = useRef(false)

  const clearHandshakeTimer = useCallback(() => {
    if (handshakeTimerRef.current === null) return
    window.clearTimeout(handshakeTimerRef.current)
    handshakeTimerRef.current = null
  }, [])

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

  // 项目切换：轮换会话、重置探测状态，并启动 3 秒源码模式探测。
  useEffect(() => {
    readyRef.current = false
    helloSucceededRef.current = false
    snapshotReadyRef.current = false
    fallbackRef.current = false
    clearHandshakeTimer()
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
      // 只有 HELLO 与首个有效 SNAPSHOT 都到齐，才算源码模式。
      if (helloSucceededRef.current && snapshotReadyRef.current) return

      fallbackRef.current = true
      readyRef.current = false
      rejectPending(
        pendingRef.current,
        '已切换为仅视觉模式，等待中的源码请求已取消',
      )
      setStatus('visual')
      setLastError(VISUAL_FALLBACK_DETAIL)
    }, HANDSHAKE_TIMEOUT_MS)

    handshakeTimerRef.current = timer

    return () => {
      window.clearTimeout(timer)
      if (handshakeTimerRef.current === timer) {
        handshakeTimerRef.current = null
      }
    }
  }, [clearHandshakeTimer, previewOrigin, projectKey])

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
        fallbackRef.current = true
        readyRef.current = false
        clearHandshakeTimer()
        setStatus('visual')
        setLastError('SDK 协议主版本不兼容，已切换为仅视觉模式；请升级 @vibe/vite-plugin。')
        return
      }

      if (data.type === 'HELLO') {
        // 降级后不再接受迟到的握手，避免界面在视觉/源码模式间反复跳变。
        if (fallbackRef.current) return
        helloSucceededRef.current = true
        readyRef.current = true
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
        if (fallbackRef.current) return
        if (Array.isArray(data.elements) && data.meta) {
          snapshotReadyRef.current = true
          setSnapshot(data as unknown as VibeSnapshot)

          // HELLO + SNAPSHOT 都到齐，才允许标注与生成进入源码模式。
          if (helloSucceededRef.current) {
            clearHandshakeTimer()
            setStatus('connected')
            setLastError(null)
          }
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
  }, [clearHandshakeTimer, previewOrigin, postRaw])

  // 15 秒心跳；连续失败时自动降级为仅视觉模式，重新加载项目可恢复。
  useEffect(() => {
    if (!previewOrigin) return
    const timer = window.setInterval(() => {
      if (!readyRef.current) return
      request('PING', {}, 1500).catch(() => {
        readyRef.current = false
        fallbackRef.current = true
        clearHandshakeTimer()
        setStatus('visual')
        setLastError(
          'iframe 心跳超时，已切换为仅视觉模式；请重新加载项目或检查 dev server。',
        )
      })
    }, 15000)

    return () => window.clearInterval(timer)
  }, [clearHandshakeTimer, previewOrigin, request])

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
