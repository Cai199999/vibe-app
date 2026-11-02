import { useState } from 'react'
import { createPortal } from 'react-dom'

import { VISUAL_PRIVACY_WARNING } from '../../lib/messages'
import { Icon } from '../ui/Icon'
import type { ComposerDraft } from '../../types/vibe'

const TYPE_META = {
  note: { label: '旁注', className: 'bg-indigo-400/15 text-indigo-200' },
  draw: { label: '圈画', className: 'bg-fuchsia-400/15 text-fuchsia-200' },
  drag: { label: '拖拽', className: 'bg-emerald-400/15 text-emerald-200' },
} as const

function defaultIntent(draft: ComposerDraft): string {
  if (draft.type === 'draw') return '修改圈选区域'
  if (draft.type === 'drag') {
    return `将 ${draft.target?.component ?? '元素'} 移动到目标位置`
  }
  return ''
}

function targetLabel(draft: ComposerDraft): string {
  if (draft.type === 'draw') {
    const count = draft.visual?.relatedTargets.length ?? 0
    const size = draft.visual?.bbox
    if (draft.visualOnly) {
      return size
        ? `视觉圈画 · ${Math.round(size.width)}×${Math.round(size.height)}`
        : '视觉圈画'
    }
    return size
      ? `${count} 个元素 · ${Math.round(size.width)}×${Math.round(size.height)}`
      : `${count} 个元素`
  }
  if (!draft.target) return '未绑定源码'
  return `${draft.target.component ?? 'Element'} · ${draft.target.source}`
}

interface ComposerPopoverProps {
  draft: ComposerDraft
  onCancel: () => void
  onSave: (intent: string) => void
}

export function ComposerPopover({
  draft,
  onCancel,
  onSave,
}: ComposerPopoverProps) {
  // 组件只在打开草稿时挂载、关闭即卸载；初始意图取当前草稿的默认值。
  const [intent, setIntent] = useState(() => defaultIntent(draft))
  const meta = TYPE_META[draft.type]
  const noteRequired = draft.type === 'note'
  const canSave = !noteRequired || intent.trim().length > 0

  const submit = () => {
    if (!canSave) return
    const finalIntent = intent.trim() || defaultIntent(draft)
    onSave(finalIntent.slice(0, 2000))
  }

  return createPortal(
    <div
      className="fixed z-[70] w-[330px] rounded-xl border border-white/10 bg-[#11151f] p-3 shadow-2xl shadow-black/50"
      style={{ left: draft.screen.left, top: draft.screen.top }}
      role="dialog"
      aria-label="添加标注"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={`rounded-md px-1.5 py-1 text-[9px] font-semibold ${meta.className}`}
          >
            {meta.label}
          </span>
          <span className="truncate font-mono text-[9px] text-slate-500">
            {targetLabel(draft)}
          </span>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="grid h-6 w-6 place-items-center rounded-md text-slate-500 hover:bg-white/5 hover:text-slate-200"
          aria-label="关闭"
        >
          <Icon name="close" size={12} />
        </button>
      </div>

      <textarea
        autoFocus
        data-testid="composer-intent"
        rows={3}
        maxLength={2000}
        value={intent}
        onChange={(event) => setIntent(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
            event.preventDefault()
            submit()
          }
          if (event.key === 'Escape') {
            event.preventDefault()
            onCancel()
          }
        }}
        placeholder="描述你希望怎么改…"
        className="mt-2.5 w-full resize-none rounded-lg border border-white/10 bg-black/20 px-2.5 py-2 text-[11px] leading-relaxed text-slate-200 outline-none placeholder:text-slate-600 focus:border-indigo-400/50"
      />

      {draft.visualOnly && (
        <span
          data-testid="composer-visual-privacy-warning"
          title={VISUAL_PRIVACY_WARNING}
          aria-label={VISUAL_PRIVACY_WARNING}
          className="mt-2 inline-flex items-center gap-1 rounded-md border border-amber-400/15 bg-amber-400/[0.05] px-1.5 py-1 text-[9px] text-amber-200/75"
        >
          <Icon name="lock" size={10} />
          截图不脱敏
        </span>
      )}

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-[9px] text-slate-600">
          {noteRequired ? '必填 · ' : ''}⌘/Ctrl + Enter
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onCancel}
            className="btn-ghost rounded-md px-2.5 py-1.5 text-[10px]"
          >
            取消
          </button>
          <button
            type="button"
            data-testid="composer-save"
            onClick={submit}
            disabled={!canSave}
            className="btn-primary rounded-md px-2.5 py-1.5 text-[10px] font-semibold disabled:cursor-not-allowed disabled:opacity-40"
          >
            保存标注
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
