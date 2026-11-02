import { useMemo } from 'react'

import { downsamplePoints, centerOfRect } from '../../lib/geometry'
import type {
  CanvasAnnotation,
  DrawAnnotation,
  DragAnnotation,
  Point,
  Rect,
  VisualDrawAnnotation,
} from '../../types/vibe'

interface AnnotationSceneProps {
  annotations: CanvasAnnotation[]
  selectedId: string | null
  liveDrawPoints: Point[] | null
  liveDrag: { fromRect: Rect; toRect: Rect } | null
}

const NOTE_STROKE = '#818cf8'
const NOTE_FILL = 'rgba(99, 102, 241, 0.055)'
const DRAW_STROKE = '#e879f9'
const DRAW_FILL = 'rgba(232, 121, 249, 0.035)'
const DRAG_STROKE = '#34d399'
const DRAG_FILL = 'rgba(52, 211, 153, 0.06)'

function rectProps(rect: Rect) {
  return {
    x: rect.x,
    y: rect.y,
    width: Math.max(1, rect.width),
    height: Math.max(1, rect.height),
  }
}

function pointsAttr(points: Point[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(' ')
}

function Arrow({
  from,
  to,
  selected,
}: {
  from: Rect
  to: Rect
  selected: boolean
}) {
  const start = centerOfRect(from)
  const end = centerOfRect(to)
  const length = Math.hypot(end.x - start.x, end.y - start.y) || 1
  const shrink = Math.min(length * 0.4, Math.min(to.width, to.height) / 2 + 4)
  const ux = (end.x - start.x) / length
  const uy = (end.y - start.y) / length

  return (
    <line
      x1={start.x}
      y1={start.y}
      x2={end.x - ux * shrink}
      y2={end.y - uy * shrink}
      stroke={DRAG_STROKE}
      strokeWidth={selected ? 2.2 : 1.5}
      markerEnd="url(#vibe-arrow)"
      vectorEffect="non-scaling-stroke"
    />
  )
}

function DrawShape({
  annotation,
  selected,
}: {
  annotation: DrawAnnotation | VisualDrawAnnotation
  selected: boolean
}) {
  const displayPoints = useMemo(
    () => downsamplePoints(annotation.visual.rawPoints, 600),
    [annotation.visual.rawPoints],
  )

  return (
    <>
      <rect
        {...rectProps(annotation.visual.bbox)}
        rx="12"
        fill={DRAW_FILL}
        stroke={DRAW_STROKE}
        strokeOpacity={selected ? 0.85 : 0.4}
        strokeWidth={selected ? 2 : 1}
        strokeDasharray="4 4"
        vectorEffect="non-scaling-stroke"
      />
      <polyline
        points={pointsAttr(displayPoints)}
        fill="none"
        stroke={DRAW_STROKE}
        strokeWidth={selected ? 3.2 : 2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </>
  )
}

function DragShape({
  annotation,
  selected,
}: {
  annotation: DragAnnotation
  selected: boolean
}) {
  return (
    <>
      <rect
        {...rectProps(annotation.drag.fromRect)}
        rx="10"
        fill="none"
        stroke="rgba(148, 163, 184, 0.5)"
        strokeWidth="1"
        strokeDasharray="3 3"
        vectorEffect="non-scaling-stroke"
      />
      <rect
        {...rectProps(annotation.drag.toRect)}
        rx="10"
        fill={DRAG_FILL}
        stroke={DRAG_STROKE}
        strokeWidth={selected ? 2.4 : 1.5}
        strokeDasharray="6 4"
        vectorEffect="non-scaling-stroke"
      />
      <Arrow
        from={annotation.drag.fromRect}
        to={annotation.drag.toRect}
        selected={selected}
      />
    </>
  )
}

export function AnnotationScene({
  annotations,
  selectedId,
  liveDrawPoints,
  liveDrag,
}: AnnotationSceneProps) {
  return (
    <svg
      className="pointer-events-none absolute left-0 top-0 z-20 h-[816px] w-[1200px] overflow-visible"
      aria-hidden="true"
    >
      <defs>
        <marker
          id="vibe-arrow"
          markerWidth="8"
          markerHeight="8"
          refX="6"
          refY="3"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <path d="M0,0 L6,3 L0,6 z" fill={DRAG_STROKE} />
        </marker>
      </defs>

      {annotations.map((annotation) => {
        const selected = annotation.id === selectedId
        if (annotation.type === 'note') {
          return (
            <rect
              key={annotation.id}
              {...rectProps(annotation.target.rect)}
              rx="10"
              fill={NOTE_FILL}
              stroke={NOTE_STROKE}
              strokeWidth={selected ? 2.5 : 1.5}
              strokeDasharray="5 4"
              vectorEffect="non-scaling-stroke"
            />
          )
        }
        if (
          annotation.type === 'draw' ||
          annotation.type === 'visual-draw'
        ) {
          return (
            <g key={annotation.id}>
              <DrawShape annotation={annotation} selected={selected} />
            </g>
          )
        }
        return (
          <g key={annotation.id}>
            <DragShape annotation={annotation} selected={selected} />
          </g>
        )
      })}

      {liveDrawPoints && liveDrawPoints.length > 1 && (
        <polyline
          points={pointsAttr(liveDrawPoints)}
          fill="none"
          stroke={DRAW_STROKE}
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeOpacity="0.8"
          vectorEffect="non-scaling-stroke"
        />
      )}

      {liveDrag && (
        <>
          <rect
            {...rectProps(liveDrag.fromRect)}
            rx="10"
            fill="none"
            stroke="rgba(148, 163, 184, 0.5)"
            strokeWidth="1"
            strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke"
          />
          <rect
            {...rectProps(liveDrag.toRect)}
            rx="10"
            fill={DRAG_FILL}
            stroke={DRAG_STROKE}
            strokeWidth="2"
            strokeDasharray="6 4"
            vectorEffect="non-scaling-stroke"
          />
          <Arrow from={liveDrag.fromRect} to={liveDrag.toRect} selected />
        </>
      )}
    </svg>
  )
}
