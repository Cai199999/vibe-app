import type { CanvasAnnotation } from '../../types/vibe'
import { Icon } from '../ui/Icon'
import { AnnotationCard } from './AnnotationCard'

interface AnnotationListProps {
  annotations: CanvasAnnotation[]
  selectedId: string | null
  visualMode: boolean
  hasScreenshot: boolean
  onSelect: (id: string) => void
  onRemove: (id: string) => void
  onClear: () => void
}

function EmptyAnnotations({
  visualMode,
  hasScreenshot,
}: {
  visualMode: boolean
  hasScreenshot: boolean
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-7 pb-16 text-center">
      <div
        className={`grid h-11 w-11 place-items-center rounded-2xl border ${
          visualMode
            ? 'border-amber-400/20 bg-amber-400/[0.08] text-amber-300'
            : 'border-indigo-400/20 bg-indigo-400/[0.08] text-indigo-300'
        }`}
      >
        <Icon name={visualMode ? 'image' : 'note'} size={19} />
      </div>
      <h3 className="mt-3.5 text-[11px] font-semibold text-slate-300">
        暂无标注
      </h3>
      <p className="mt-1.5 max-w-[210px] text-[9px] leading-relaxed text-slate-600">
        {visualMode
          ? hasScreenshot
            ? '按 P 在截图上圈画，也可直接生成'
            : '先上传截图，再在截图上圈画'
          : '在预览上点击元素、圈画或拖拽'}
      </p>
    </div>
  )
}

export function AnnotationList({
  annotations,
  selectedId,
  visualMode,
  hasScreenshot,
  onSelect,
  onRemove,
  onClear,
}: AnnotationListProps) {
  if (annotations.length === 0) {
    return (
      <EmptyAnnotations
        visualMode={visualMode}
        hasScreenshot={hasScreenshot}
      />
    )
  }

  return (
    <div data-testid="annotation-list" className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between px-3 pb-2 pt-0.5">
        <span className="text-[9px] text-slate-600">
          {annotations.length} 条标注
        </span>
        <button
          type="button"
          onClick={onClear}
          className="grid h-6 w-6 place-items-center rounded text-slate-600 transition hover:bg-rose-400/10 hover:text-rose-300"
          title="清空全部标注"
          aria-label="清空全部标注"
        >
          <Icon name="trash" size={11} />
        </button>
      </div>

      <div className="panel-scroll min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-3">
        {annotations.map((annotation, index) => (
          <AnnotationCard
            key={annotation.id}
            annotation={annotation}
            index={index}
            selected={annotation.id === selectedId}
            onSelect={() => onSelect(annotation.id)}
            onRemove={() => onRemove(annotation.id)}
          />
        ))}
      </div>
    </div>
  )
}
