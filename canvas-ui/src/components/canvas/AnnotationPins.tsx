import type { CanvasAnnotation } from '../../types/vibe'

interface AnnotationPinsProps {
  annotations: CanvasAnnotation[]
  selectedId: string | null
  zoom: number
  onSelect: (id: string) => void
}

const TYPE_CLASS: Record<CanvasAnnotation['type'], string> = {
  note: 'bg-indigo-500',
  draw: 'bg-fuchsia-600',
  drag: 'bg-emerald-600',
  'visual-draw': 'bg-amber-500',
}

function pinPoint(annotation: CanvasAnnotation) {
  if (annotation.type === 'note') {
    return {
      x: annotation.target.rect.x + annotation.target.rect.width,
      y: annotation.target.rect.y,
    }
  }
  if (
    annotation.type === 'draw' ||
    annotation.type === 'visual-draw'
  ) {
    return {
      x: annotation.visual.bbox.x + annotation.visual.bbox.width,
      y: annotation.visual.bbox.y,
    }
  }
  return {
    x: annotation.drag.toRect.x + annotation.drag.toRect.width,
    y: annotation.drag.toRect.y,
  }
}

function pinTitle(annotation: CanvasAnnotation): string {
  if (annotation.type === 'visual-draw') return '视觉圈画 · 无源码'
  return `${annotation.type} · ${
    annotation.target.component ?? annotation.target.source
  }`
}

export function AnnotationPins({
  annotations,
  selectedId,
  zoom,
  onSelect,
}: AnnotationPinsProps) {
  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      {annotations.map((annotation, index) => {
        const point = pinPoint(annotation)
        return (
          <button
            key={annotation.id}
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onSelect(annotation.id)
            }}
            title={pinTitle(annotation)}
            className={`pointer-events-auto absolute grid h-6 w-6 place-items-center rounded-lg border-2 border-[#0b0d12] text-[10px] font-extrabold text-white shadow-lg ${TYPE_CLASS[annotation.type]} ${
              annotation.id === selectedId
                ? 'outline outline-2 outline-offset-2 outline-white/80'
                : ''
            }`}
            style={{
              left: point.x,
              top: point.y,
              transform: `translate(-50%, -50%) scale(${1 / zoom})`,
            }}
          >
            {index + 1}
          </button>
        )
      })}
    </div>
  )
}
