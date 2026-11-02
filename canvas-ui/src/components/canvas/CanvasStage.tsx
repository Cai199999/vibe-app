import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

import { useCanvasViewport } from '../../hooks/useCanvasViewport'
import type { ToastTone } from '../../hooks/useToast'
import {
  ARTBOARD_HEIGHT,
  ARTBOARD_WIDTH,
  IFRAME_HEIGHT,
  IFRAME_ORIGIN,
  MAX_RAW_POINTS,
} from '../../lib/constants'
import {
  axisOf,
  bboxOf,
  clamp,
  expandRect,
  offsetRect,
  roundRect,
  screenToWorld,
  worldToScreen,
} from '../../lib/geometry'
import { createAnnotationId } from '../../lib/ids'
import { toWorldTarget } from '../../lib/targets'
import type {
  BridgeTarget,
  CanvasAnnotation,
  ComposerDraft,
  Mode,
  Point,
  Rect,
  WorldTarget,
} from '../../types/vibe'
import type { IframeBridge } from '../../hooks/useIframeBridge'
import { AnnotationPins } from './AnnotationPins'
import { AnnotationScene } from './AnnotationScene'
import { CanvasControls } from './CanvasControls'
import { ComposerPopover } from './ComposerPopover'
import { HoverBox } from './HoverBox'
import { PreviewFrame } from './PreviewFrame'
import { Icon } from '../ui/Icon'

type Gesture =
  | {
      kind: 'pan'
      startX: number
      startY: number
      startPan: Point
      pointerId: number
    }
  | { kind: 'draw'; pointerId: number; points: Point[] }
  | {
      kind: 'drag'
      pointerId: number
      start: Point
      target: BridgeTarget
      fromRect: Rect
    }

type ComposerSeed = Omit<ComposerDraft, 'screen'>

const MODE_HINT: Record<Mode, string> = {
  interact: '预览可交互；切到「旁注」开始指认。',
  hand: '拖动画布查看不同区域；Ctrl/⌘ + 滚轮缩放。',
  note: '点击页面元素，写下修改意图。',
  draw: '按住拖动画圈，圈住要修改的区域。',
  drag: '拖拽元素表达目标位置，不会直接修改 DOM。',
}

const MODE_LABEL: Record<Mode, string> = {
  interact: '交互模式',
  hand: '抓手模式',
  note: '旁注模式',
  draw: '圈画模式',
  drag: '拖拽模式',
}

function isInsideIframe(point: Point): boolean {
  return (
    point.x >= 0 &&
    point.y >= 0 &&
    point.x <= ARTBOARD_WIDTH &&
    point.y <= IFRAME_HEIGHT
  )
}

function uniqueSources(targets: WorldTarget[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  targets.forEach((target) => {
    if (!seen.has(target.source)) {
      seen.add(target.source)
      result.push(target.source)
    }
  })
  return result.slice(0, 20)
}

function defaultTargetSummary(target: WorldTarget): string {
  return `${target.component ?? '目标元素'}：${target.source}`
}

interface CanvasStageProps {
  bridge: IframeBridge
  annotations: CanvasAnnotation[]
  selectedId: string | null
  mode: Mode
  onModeChange: (mode: Mode) => void
  onAdd: (annotation: CanvasAnnotation) => void
  onSelect: (id: string) => void
  onUndo: () => void
  showToast: (message: string, tone?: ToastTone) => void
}

export function CanvasStage({
  bridge,
  annotations,
  selectedId,
  mode,
  onModeChange,
  onAdd,
  onSelect,
  onUndo,
  showToast,
}: CanvasStageProps) {
  const {
    canvasRef,
    viewport,
    panBy,
    setPan,
    fit,
    resetZoom,
    zoomAt,
    zoomBy,
  } = useCanvasViewport()

  const [composer, setComposer] = useState<ComposerDraft | null>(null)
  const [liveDrawPoints, setLiveDrawPoints] = useState<Point[] | null>(null)
  const [liveDrag, setLiveDrag] = useState<{
    fromRect: Rect
    toRect: Rect
  } | null>(null)
  const [hoverTarget, setHoverTarget] = useState<WorldTarget | null>(null)
  const [spaceDown, setSpaceDown] = useState(false)

  const gestureRef = useRef<Gesture | null>(null)
  const spaceRef = useRef(false)
  const hoverSeqRef = useRef(0)
  const hoverAtRef = useRef(0)
  const composerRef = useRef<ComposerDraft | null>(null)
  const annotationCountRef = useRef(annotations.length)
  composerRef.current = composer

  const showError = useCallback(
    (error: unknown, fallback: string) => {
      showToast(error instanceof Error ? error.message : fallback, 'error')
    },
    [showToast],
  )

  const clearLive = useCallback(() => {
    setLiveDrawPoints(null)
    setLiveDrag(null)
  }, [])

  const closeComposer = useCallback(() => {
    setComposer(null)
    clearLive()
  }, [clearLive])

  const openComposer = useCallback(
    (seed: ComposerSeed) => {
      const element = canvasRef.current
      if (!element) return
      const canvasRect = element.getBoundingClientRect()
      const anchor = seed.anchorRect
      const screenPoint = worldToScreen(
        { x: anchor.x + anchor.width, y: anchor.y },
        canvasRect,
        viewport,
      )
      const width = 330
      const height = 220
      let left = screenPoint.x + 18
      if (left + width > window.innerWidth - 16) {
        left = Math.max(16, screenPoint.x - width - 18)
      }
      const top = clamp(
        screenPoint.y - 8,
        canvasRect.top + 68,
        window.innerHeight - height - 16,
      )
      setComposer({ ...seed, screen: { left, top } })
      setHoverTarget(null)
    },
    [canvasRef, viewport],
  )

  const screenPointToWorld = useCallback(
    (clientX: number, clientY: number): Point | null => {
      const element = canvasRef.current
      if (!element) return null
      return screenToWorld(
        clientX,
        clientY,
        element.getBoundingClientRect(),
        viewport,
      )
    },
    [canvasRef, viewport],
  )

  const worldToIframePoint = useCallback((point: Point): Point => {
    return {
      x: point.x - IFRAME_ORIGIN.x,
      y: point.y - IFRAME_ORIGIN.y,
    }
  }, [])

  const centerOnAnnotation = useCallback(
    (annotation: CanvasAnnotation) => {
      const element = canvasRef.current
      if (!element) return
      const rect =
        annotation.type === 'note'
          ? annotation.target.rect
          : annotation.type === 'draw'
            ? annotation.visual.bbox
            : annotation.drag.toRect
      const canvasRect = element.getBoundingClientRect()
      setPan(
        canvasRect.width / 2 - (rect.x + rect.width / 2) * viewport.zoom,
        canvasRect.height / 2 - (rect.y + rect.height / 2) * viewport.zoom,
      )
    },
    [canvasRef, setPan, viewport.zoom],
  )

  useEffect(() => {
    const grew = annotations.length > annotationCountRef.current
    annotationCountRef.current = annotations.length
    // 新增标注时保持当前视口，避免用户刚画完就被强制平移；
    // 仅当用户从列表/编号主动选中已有标注时聚焦。
    if (!selectedId || grew) return
    const annotation = annotations.find((item) => item.id === selectedId)
    if (annotation) centerOnAnnotation(annotation)
    // 选择变化才触发；annotations 作为最新快照读取。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  const hideHover = useCallback(() => {
    hoverSeqRef.current += 1
    setHoverTarget(null)
  }, [])

  const updateHover = useCallback(
    (clientX: number, clientY: number) => {
      if (
        (mode !== 'note' && mode !== 'drag') ||
        composerRef.current ||
        gestureRef.current ||
        bridge.status !== 'connected'
      ) {
        hideHover()
        return
      }

      const now = performance.now()
      if (now - hoverAtRef.current < 70) return
      hoverAtRef.current = now

      const world = screenPointToWorld(clientX, clientY)
      if (!world) return
      const local = worldToIframePoint(world)
      if (!isInsideIframe(local)) {
        hideHover()
        return
      }

      const seq = ++hoverSeqRef.current
      bridge
        .hitTest(local.x, local.y, false, false)
        .then((result) => {
          if (seq !== hoverSeqRef.current) return
          setHoverTarget(result.hit && result.target ? toWorldTarget(result.target) : null)
        })
        .catch(() => {
          if (seq === hoverSeqRef.current) hideHover()
        })
    },
    [
      bridge,
      hideHover,
      mode,
      screenPointToWorld,
      worldToIframePoint,
    ],
  )

  const getSnippet = useCallback(
    async (target: BridgeTarget) => {
      const result = await bridge.sourceSnippet(target.source)
      if (!result.found || !result.jsxSnippet) {
        throw new Error(
          result.error?.message ||
            '该元素没有可用的 JSX 片段，已阻止生成 Prompt。',
        )
      }
      return result.jsxSnippet
    },
    [bridge],
  )

  const beginNote = useCallback(
    async (clientX: number, clientY: number) => {
      if (composerRef.current) return
      if (bridge.status !== 'connected') {
        showToast('预览尚未连接，请稍候或刷新页面。', 'error')
        return
      }
      const world = screenPointToWorld(clientX, clientY)
      if (!world) return
      const local = worldToIframePoint(world)
      if (!isInsideIframe(local)) return

      try {
        const hit = await bridge.hitTest(local.x, local.y, true, true)
        if (!hit.hit || !hit.target) {
          showToast(
            hit.error?.message || '该位置没有带 data-source 的元素。',
            'error',
          )
          return
        }
        if (hit.error && hit.error.code === 'SNIPPET_NOT_FOUND') {
          showToast(hit.error.message, 'error')
          return
        }
        const snippet = hit.jsxSnippet ?? (await getSnippet(hit.target))
        const target = toWorldTarget(hit.target)
        openComposer({
          type: 'note',
          target,
          snippet,
          anchorRect: target.rect,
        })
      } catch (error) {
        showError(error, '读取目标元素失败。')
      }
    },
    [
      bridge,
      getSnippet,
      openComposer,
      screenPointToWorld,
      showError,
      showToast,
      worldToIframePoint,
    ],
  )

  const beginDrag = useCallback(
    async (clientX: number, clientY: number) => {
      if (composerRef.current) return
      if (bridge.status !== 'connected') {
        showToast('预览尚未连接，请稍候或刷新页面。', 'error')
        return
      }
      const world = screenPointToWorld(clientX, clientY)
      if (!world) return
      const local = worldToIframePoint(world)
      if (!isInsideIframe(local)) return

      try {
        const hit = await bridge.hitTest(local.x, local.y, false, true)
        if (!hit.hit || !hit.target) {
          showToast(
            hit.error?.message || '请从带 data-source 的元素上开始拖拽。',
            'error',
          )
          return
        }
        const fromRect = toWorldTarget(hit.target).rect
        gestureRef.current = {
          kind: 'drag',
          pointerId: -1,
          start: world,
          target: hit.target,
          fromRect,
        }
        setLiveDrag({ fromRect, toRect: fromRect })
        setHoverTarget(null)
      } catch (error) {
        showError(error, '读取拖拽目标失败。')
      }
    },
    [
      bridge,
      screenPointToWorld,
      showError,
      showToast,
      worldToIframePoint,
    ],
  )

  const finishDraw = useCallback(
    async (points: Point[]) => {
      if (points.length < 2) {
        clearLive()
        return
      }
      const bbox = bboxOf(points)
      if (bbox.width < 8 || bbox.height < 8) {
        showToast('圈选范围太小，请重新圈画。', 'error')
        clearLive()
        return
      }
      if (bridge.status !== 'connected') {
        showToast('预览尚未连接，请稍候再试。', 'error')
        clearLive()
        return
      }

      const localRect = roundRect(
        offsetRect(bbox, -IFRAME_ORIGIN.x, -IFRAME_ORIGIN.y),
      )
      try {
        const result = await bridge.elementsInBox(localRect, false)
        if (result.elements.length === 0) {
          showToast(
            '圈选区域内没有带 data-source 的元素，请重新圈画。',
            'error',
          )
          clearLive()
          return
        }

        const primaryLocal = result.elements[0]
        const snippet = await getSnippet(primaryLocal)
        const relatedTargets = result.elements.map(toWorldTarget)
        const target = relatedTargets[0]
        const relatedSources = uniqueSources(relatedTargets)
        const visual = {
          rawPoints: points.slice(0, MAX_RAW_POINTS),
          bbox: roundRect(bbox),
          relatedSources,
          relatedTargets,
          spatialSummary: `手绘轨迹覆盖 ${relatedSources.length} 个元素，包围盒 ${Math.round(
            bbox.width,
          )}×${Math.round(bbox.height)} 像素。`,
        }

        openComposer({
          type: 'draw',
          target,
          snippet,
          anchorRect: expandRect(bbox, 8),
          visual,
        })
      } catch (error) {
        clearLive()
        showError(error, '圈画目标解析失败。')
      }
    },
    [bridge, clearLive, getSnippet, openComposer, showError, showToast],
  )

  const finishDrag = useCallback(
    async (
      gesture: Extract<Gesture, { kind: 'drag' }>,
      end: Point,
    ) => {
      const delta = {
        x: end.x - gesture.start.x,
        y: end.y - gesture.start.y,
      }
      setLiveDrag(null)

      if (Math.hypot(delta.x, delta.y) < 6) {
        return
      }
      if (bridge.status !== 'connected') {
        showToast('预览尚未连接，请稍候再试。', 'error')
        return
      }

      try {
        const snippet = await getSnippet(gesture.target)
        const target = toWorldTarget(gesture.target)
        const toRect = offsetRect(gesture.fromRect, delta.x, delta.y)
        const axis = axisOf(delta)
        const direction =
          axis === 'x' ? '水平方向' : axis === 'y' ? '垂直方向' : '斜向'
        const drag = {
          from: gesture.start,
          to: end,
          delta,
          fromRect: gesture.fromRect,
          toRect,
          axis,
          relatedSources: [target.source],
          spatialSummary: `${target.component ?? '元素'} 沿${direction}移动 Δx=${Math.round(
            delta.x,
          )}, Δy=${Math.round(delta.y)} 像素；原始位置 ${defaultTargetSummary(
            target,
          )}。`,
        }
        openComposer({
          type: 'drag',
          target,
          snippet,
          anchorRect: toRect,
          drag,
        })
      } catch (error) {
        showError(error, '读取拖拽目标的 JSX 片段失败。')
      }
    },
    [bridge, getSnippet, openComposer, showError, showToast],
  )

  const startPan = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      gestureRef.current = {
        kind: 'pan',
        startX: event.clientX,
        startY: event.clientY,
        startPan: { ...viewport.pan },
        pointerId: event.pointerId,
      }
      hideHover()
      try {
        event.currentTarget.setPointerCapture(event.pointerId)
      } catch {
        // 某些浏览器在合成事件下可能拒绝 capture，不影响主流程。
      }
    },
    [hideHover, viewport.pan],
  )

  const onCanvasPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (composerRef.current || gestureRef.current) return
      const shouldPan =
        event.button === 1 ||
        spaceRef.current ||
        (event.target === event.currentTarget && mode === 'hand')
      if (!shouldPan) return
      event.preventDefault()
      startPan(event)
    },
    [mode, startPan],
  )

  const onCapturePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (composerRef.current || gestureRef.current) return
      if (event.button === 1 || spaceRef.current || mode === 'hand') {
        event.preventDefault()
        event.stopPropagation()
        startPan(event)
        return
      }

      if (mode === 'note') {
        event.preventDefault()
        event.stopPropagation()
        void beginNote(event.clientX, event.clientY)
        return
      }

      if (mode === 'draw') {
        event.preventDefault()
        event.stopPropagation()
        const world = screenPointToWorld(event.clientX, event.clientY)
        if (!world) return
        try {
          event.currentTarget.setPointerCapture(event.pointerId)
        } catch {
          // 忽略不支持 pointer capture 的环境。
        }
        gestureRef.current = {
          kind: 'draw',
          pointerId: event.pointerId,
          points: [world],
        }
        setLiveDrawPoints([world])
        setHoverTarget(null)
        return
      }

      if (mode === 'drag') {
        event.preventDefault()
        event.stopPropagation()
        const world = screenPointToWorld(event.clientX, event.clientY)
        if (!world) return
        try {
          event.currentTarget.setPointerCapture(event.pointerId)
        } catch {
          // 忽略不支持 pointer capture 的环境。
        }
        void beginDrag(event.clientX, event.clientY)
      }
    },
    [beginDrag, beginNote, mode, screenPointToWorld, startPan],
  )

  const onCanvasPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const gesture = gestureRef.current
      if (!gesture) {
        updateHover(event.clientX, event.clientY)
        return
      }

      if (gesture.kind === 'pan') {
        panBy(
          event.clientX - gesture.startX,
          event.clientY - gesture.startY,
        )
        return
      }

      const world = screenPointToWorld(event.clientX, event.clientY)
      if (!world) return

      if (gesture.kind === 'draw') {
        const last = gesture.points[gesture.points.length - 1]
        if (
          last &&
          Math.hypot(world.x - last.x, world.y - last.y) < 1.5
        ) {
          return
        }
        if (gesture.points.length >= MAX_RAW_POINTS) return
        gesture.points.push(world)
        setLiveDrawPoints([...gesture.points])
        return
      }

      const delta = {
        x: world.x - gesture.start.x,
        y: world.y - gesture.start.y,
      }
      setLiveDrag({
        fromRect: gesture.fromRect,
        toRect: offsetRect(gesture.fromRect, delta.x, delta.y),
      })
    },
    [panBy, screenPointToWorld, updateHover],
  )

  const onCanvasPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const gesture = gestureRef.current
      if (!gesture) return
      gestureRef.current = null

      if (gesture.kind === 'pan') {
        return
      }

      if (gesture.kind === 'draw') {
        void finishDraw(gesture.points)
        return
      }

      const world = screenPointToWorld(event.clientX, event.clientY)
      if (!world) {
        setLiveDrag(null)
        return
      }
      void finishDrag(gesture, world)
    },
    [finishDrag, finishDraw, screenPointToWorld],
  )

  const onCanvasPointerCancel = useCallback(() => {
    gestureRef.current = null
    setLiveDrawPoints(null)
    setLiveDrag(null)
  }, [])

  const saveComposer = useCallback(
    (intent: string) => {
      const draft = composerRef.current
      if (!draft) return
      const createdAt = new Date().toISOString()

      if (draft.type === 'note') {
        onAdd({
          id: createAnnotationId(),
          type: 'note',
          intent,
          createdAt,
          target: draft.target,
          snippet: draft.snippet,
        })
      } else if (draft.type === 'draw' && draft.visual) {
        onAdd({
          id: createAnnotationId(),
          type: 'draw',
          intent,
          createdAt,
          target: draft.target,
          snippet: draft.snippet,
          visual: draft.visual,
        })
      } else if (draft.type === 'drag' && draft.drag) {
        onAdd({
          id: createAnnotationId(),
          type: 'drag',
          intent,
          createdAt,
          target: draft.target,
          snippet: draft.snippet,
          drag: draft.drag,
        })
      }

      setComposer(null)
      clearLive()
      showToast('已添加标注', 'success')
    },
    [clearLive, onAdd, showToast],
  )

  useEffect(() => {
    const element = canvasRef.current
    if (!element) return

    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      if (event.ctrlKey || event.metaKey) {
        zoomAt(event.clientX, event.clientY, event.deltaY > 0 ? 0.92 : 1.08)
      } else {
        panBy(-event.deltaX, -event.deltaY)
      }
    }

    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [canvasRef, panBy, zoomAt])

  useEffect(() => {
    const isTyping = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false
      const tag = target.tagName.toLowerCase()
      return (
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select' ||
        tag === 'button' ||
        tag === 'a' ||
        target.isContentEditable
      )
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return

      if (event.code === 'Space') {
        event.preventDefault()
        spaceRef.current = true
        setSpaceDown(true)
        return
      }

      if (event.key === 'Escape') {
        if (composerRef.current) {
          closeComposer()
        } else {
          gestureRef.current = null
          clearLive()
          hideHover()
        }
        return
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        onUndo()
        return
      }

      const key = event.key.toLowerCase()
      const shortcuts: Record<string, Mode> = {
        v: 'interact',
        h: 'hand',
        n: 'note',
        p: 'draw',
        d: 'drag',
      }
      if (shortcuts[key]) {
        event.preventDefault()
        onModeChange(shortcuts[key])
      }
    }

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        spaceRef.current = false
        setSpaceDown(false)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [clearLive, closeComposer, hideHover, onModeChange, onUndo])

  const cursor =
    mode === 'hand' || spaceDown
      ? 'grab'
      : mode === 'interact'
        ? 'default'
        : 'crosshair'

  return (
    <main
      ref={canvasRef}
      className={`canvas-grid relative min-w-0 flex-1 touch-none overflow-hidden ${
        spaceDown ? 'cursor-grab' : ''
      }`}
      style={{
        backgroundSize: `${24 * viewport.zoom}px ${24 * viewport.zoom}px`,
        backgroundPosition: `${viewport.pan.x}px ${viewport.pan.y}px`,
      }}
      onPointerDown={onCanvasPointerDown}
      onPointerMove={onCanvasPointerMove}
      onPointerUp={onCanvasPointerUp}
      onPointerCancel={onCanvasPointerCancel}
      onPointerLeave={hideHover}
    >
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{
          width: ARTBOARD_WIDTH,
          height: ARTBOARD_HEIGHT,
          transform: `translate(${viewport.pan.x}px, ${viewport.pan.y}px) scale(${viewport.zoom})`,
        }}
      >
        <PreviewFrame
          iframeRef={bridge.iframeRef}
          status={bridge.status}
          revision={bridge.snapshot?.revision ?? null}
          previewOrigin={window.location.origin}
        />

        <div
          data-testid="preview-capture"
          className="absolute left-0 z-10"
          style={{
            top: IFRAME_ORIGIN.y,
            width: ARTBOARD_WIDTH,
            height: IFRAME_HEIGHT,
            pointerEvents:
              mode === 'interact' && !spaceDown && !composer ? 'none' : 'auto',
            cursor,
          }}
          onPointerDown={onCapturePointerDown}
        />

        <AnnotationScene
          annotations={annotations}
          selectedId={selectedId}
          liveDrawPoints={liveDrawPoints}
          liveDrag={liveDrag}
        />

        {hoverTarget && mode !== 'interact' && mode !== 'hand' && (
          <HoverBox target={hoverTarget} zoom={viewport.zoom} />
        )}

        <AnnotationPins
          annotations={annotations}
          selectedId={selectedId}
          zoom={viewport.zoom}
          onSelect={onSelect}
        />
      </div>

      <div className="pointer-events-none absolute left-4 top-4 z-40 flex items-center gap-2 rounded-full border border-white/10 bg-[#0c0f15]/80 px-3 py-1.5 text-[10px] text-slate-400 backdrop-blur">
        <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
        <span>{MODE_LABEL[mode]}</span>
        <span className="hidden text-slate-600 sm:inline">
          {MODE_HINT[mode]}
        </span>
      </div>

      <div className="pointer-events-none absolute bottom-5 left-1/2 z-30 hidden -translate-x-1/2 items-center gap-3 rounded-full border border-white/[0.07] bg-[#0c0f15]/75 px-3 py-1.5 text-[10px] text-slate-500 backdrop-blur md:flex">
        <span>空格 + 拖动 平移</span>
        <span className="h-3 w-px bg-white/10" />
        <span>⌘/Ctrl + 滚轮 缩放</span>
        <span className="h-3 w-px bg-white/10" />
        <span>Esc 取消</span>
      </div>

      <CanvasControls
        zoom={viewport.zoom}
        onZoomIn={() => zoomBy(1.12)}
        onZoomOut={() => zoomBy(0.89)}
        onReset={resetZoom}
        onFit={fit}
      />

      {composer && (
        <ComposerPopover
          draft={composer}
          onCancel={closeComposer}
          onSave={saveComposer}
        />
      )}

      {bridge.status === 'error' && bridge.lastError && (
        <div className="pointer-events-none absolute right-4 top-4 z-40 flex items-center gap-2 rounded-lg border border-rose-400/25 bg-rose-950/70 px-3 py-1.5 text-[10px] text-rose-200 backdrop-blur">
          <Icon name="alert" size={12} />
          {bridge.lastError}
        </div>
      )}
    </main>
  )
}
