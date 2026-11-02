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
  const shortcuts = visualMode
    ? [
        ['P', hasScreenshot ? '在截图上圈画重点' : '上传截图后圈画重点'],
        ['V', '交互浏览页面'],
      ]
    : [
        ['N', '点击元素写下旁注'],
        ['P', '圈画要修改的区域'],
        ['D', '拖拽元素表达位置'],
      ]

  return (
    <div className="flex h-full flex-col items-center justify-center px-7 pb-16 text-center">
      <div
        className={`grid h-12 w-12 place-items-center rounded-2xl border ${
          visualMode
            ? 'border-amber-400/20 bg-amber-400/[0.08] text-amber-300'
            : 'border-indigo-400/20 bg-indigo-400/[0.08] text-indigo-300'
        }`}
      >
        <Icon name={visualMode ? 'image' : 'note'} size={20} />
      </div>
      <h3 className="mt-4 text-[12px] font-semibold text-slate-200">
        {visualMode ? '仅视觉模式' : '还没有标注'}
      </h3>
      <p className="mt-1.5 max-w-[230px] text-[10px] leading-relaxed text-slate-500">
        {visualMode
          ? hasScreenshot
            ? '截图已加载。按 P 在截图上圈画重点，生成时会把红笔轨迹合成进图片并调用视觉模型。'
            : '当前页面未接入源码插件。请先上传或粘贴截图，再在截图上圈画重点。'
          : '在左侧预览上点击元素、圈画区域或拖拽元素。每条标注都会绑定 data-source 与真实 JSX 片段。'}
      </p>
      <div className="mt-4 grid w-full max-w-[240px] gap-1.5">
        {shortcuts.map(([key, label]) => (
          <div
            key={key}
            className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.025] px-2.5 py-1.5 text-left"
          >
            <kbd className="grid h-5 w-5 place-items-center rounded border border-white/10 bg-white/[0.06] font-mono text-[9px] text-slate-400">
              {key}
            </kbd>
            <span className="text-[10px] text-slate-500">{label}</span>
          </div>
        ))}
      </div>
      <p className="mt-4 text-[9px] text-slate-600">
        {visualMode
          ? hasScreenshot
            ? '也可不圈画，直接提交整张截图给视觉模型。截图只在本机内存中处理。'
            : '截图只在本机内存中合成，不会落盘或自动上传。'
          : '生成的 Prompt 不会包含 Diff，也不会修改你的代码。'}
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
        <span className="text-[9px] text-slate-500">
          共 {annotations.length} 条 ·{' '}
          {visualMode
            ? hasScreenshot
              ? '截图 + 圈画可生成'
              : '需先上传截图'
            : '源码标注可生成 Prompt'}
        </span>
        <button
          type="button"
          onClick={onClear}
          className="rounded px-1.5 py-0.5 text-[9px] text-slate-600 transition hover:bg-rose-400/10 hover:text-rose-300"
        >
          清空全部
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
