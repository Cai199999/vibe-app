import type { CanvasAnnotation } from '../../types/vibe'
import { Icon, type IconName } from '../ui/Icon'

const TYPE_META: Record<
  CanvasAnnotation['type'],
  { label: string; icon: IconName; badge: string; stripe: string }
> = {
  note: {
    label: '旁注',
    icon: 'note',
    badge: 'bg-indigo-400/12 text-indigo-300',
    stripe: 'bg-indigo-400',
  },
  draw: {
    label: '圈画',
    icon: 'draw',
    badge: 'bg-fuchsia-400/12 text-fuchsia-300',
    stripe: 'bg-fuchsia-400',
  },
  drag: {
    label: '拖拽',
    icon: 'drag',
    badge: 'bg-emerald-400/12 text-emerald-300',
    stripe: 'bg-emerald-400',
  },
  'visual-draw': {
    label: '视觉圈画',
    icon: 'draw',
    badge: 'bg-amber-400/12 text-amber-300',
    stripe: 'bg-amber-400',
  },
}

function formatTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '--:--'
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function annotationMeta(annotation: CanvasAnnotation): string {
  if (annotation.type === 'visual-draw') {
    return `仅视觉 · ${Math.round(
      annotation.visual.bbox.width,
    )}×${Math.round(annotation.visual.bbox.height)}`
  }
  if (annotation.type === 'draw') {
    const count = annotation.visual.relatedSources.length
    return `${count} 个关联元素 · ${Math.round(
      annotation.visual.bbox.width,
    )}×${Math.round(annotation.visual.bbox.height)}`
  }
  if (annotation.type === 'drag') {
    return `Δx ${Math.round(annotation.drag.delta.x)} · Δy ${Math.round(
      annotation.drag.delta.y,
    )} px`
  }
  return `${Math.round(annotation.target.rect.width)}×${Math.round(
    annotation.target.rect.height,
  )} px`
}

interface AnnotationCardProps {
  annotation: CanvasAnnotation
  index: number
  selected: boolean
  onSelect: () => void
  onRemove: () => void
}

export function AnnotationCard({
  annotation,
  index,
  selected,
  onSelect,
  onRemove,
}: AnnotationCardProps) {
  const meta = TYPE_META[annotation.type]
  const snippetLines =
    annotation.type === 'visual-draw'
      ? null
      : annotation.snippet.endLine >= annotation.snippet.startLine
        ? `${annotation.snippet.startLine}–${annotation.snippet.endLine} 行`
        : '片段'

  return (
    <article
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect()
        }
      }}
      className={`group relative cursor-pointer overflow-hidden rounded-xl border bg-[#10141d] transition ${
        selected
          ? 'border-indigo-400/45 ring-1 ring-indigo-400/20'
          : 'border-white/[0.07] hover:border-white/15 hover:bg-[#121722]'
      }`}
    >
      <span className={`absolute inset-y-0 left-0 w-0.5 ${meta.stripe}`} />

      <div className="px-3 py-2.5 pl-3.5">
        <div className="flex items-center gap-1.5">
          <span className="grid h-5 min-w-5 place-items-center rounded-md bg-white/[0.06] px-1 font-mono text-[9px] font-bold text-slate-300">
            {index + 1}
          </span>
          <span
            className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-semibold ${meta.badge}`}
          >
            <Icon name={meta.icon} size={10} />
            {meta.label}
          </span>
          <span className="ml-auto font-mono text-[9px] text-slate-600">
            {formatTime(annotation.createdAt)}
          </span>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onRemove()
            }}
            className="grid h-5 w-5 place-items-center rounded-md text-slate-600 opacity-0 transition hover:bg-rose-400/10 hover:text-rose-300 group-hover:opacity-100 focus:opacity-100"
            title="删除标注"
            aria-label={`删除第 ${index + 1} 条标注`}
          >
            <Icon name="trash" size={11} />
          </button>
        </div>

        <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-slate-200">
          {annotation.intent || '（未填写修改意图）'}
        </p>

        {annotation.type !== 'visual-draw' && (
          <div className="mt-2 flex min-w-0 items-center gap-1.5">
            <Icon
              name="file"
              size={10}
              className="shrink-0 text-slate-600"
            />
            <span className="truncate font-mono text-[9px] text-slate-500">
              {annotation.target.source}
            </span>
          </div>
        )}

        <div className="mt-1.5 flex items-center justify-between gap-2">
          <span className="truncate text-[9px] text-slate-600">
            {annotationMeta(annotation)}
          </span>
          {annotation.type !== 'visual-draw' ? (
            <span className="shrink-0 rounded bg-white/[0.04] px-1.5 py-0.5 font-mono text-[8px] text-slate-500">
              JSX {snippetLines}
              {annotation.snippet.truncated ? ' · 截断' : ''}
            </span>
          ) : (
            <span className="shrink-0 rounded bg-amber-400/[0.08] px-1.5 py-0.5 font-mono text-[8px] text-amber-300/80">
              无源码
            </span>
          )}
        </div>
      </div>
    </article>
  )
}
