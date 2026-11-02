import { useState } from 'react'

import type { ToastTone } from '../../hooks/useToast'
import type { PromptErrorState } from '../../hooks/usePromptGeneration'
import { PROMPT_API_BASE } from '../../lib/constants'
import type { CanvasAnnotation, PromptResponse } from '../../types/vibe'
import { Icon } from '../ui/Icon'
import { AnnotationList } from './AnnotationList'
import { PromptResult } from './PromptResult'

type Tab = 'annotations' | 'prompt'

interface RightPanelProps {
  annotations: CanvasAnnotation[]
  selectedId: string | null
  loading: boolean
  error: PromptErrorState | null
  response: PromptResponse | null
  onSelect: (id: string) => void
  onRemove: (id: string) => void
  onClear: () => void
  onGenerate: () => Promise<unknown>
  showToast: (message: string, tone?: ToastTone) => void
}

export function RightPanel({
  annotations,
  selectedId,
  loading,
  error,
  response,
  onSelect,
  onRemove,
  onClear,
  onGenerate,
  showToast,
}: RightPanelProps) {
  const [tab, setTab] = useState<Tab>('annotations')

  const handleGenerate = () => {
    if (annotations.length === 0) {
      setTab('annotations')
      showToast('请先在预览上添加至少一条标注。', 'info')
      return
    }
    setTab('prompt')
    void onGenerate()
  }

  return (
    <aside className="flex w-[400px] shrink-0 flex-col border-l border-white/[0.08] bg-[#0b0e14] xl:w-[420px]">
      <div className="shrink-0 border-b border-white/[0.07] px-3 pb-2.5 pt-3">
        <div className="flex items-center justify-between px-0.5">
          <div>
            <h2 className="text-[12px] font-semibold tracking-tight text-slate-100">
              Prompt 工作台
            </h2>
            <p className="mt-0.5 text-[9px] text-slate-600">
              空间操作 → 结构化指令 · 仅本地会话
            </p>
          </div>
          <span className="rounded-full border border-emerald-400/15 bg-emerald-400/[0.06] px-2 py-0.5 font-mono text-[8px] text-emerald-300/80">
            LOCAL
          </span>
        </div>

        <div
          className="mt-2.5 flex rounded-lg bg-white/[0.035] p-0.5 ring-1 ring-white/[0.06]"
          role="tablist"
          aria-label="工作台面板"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'annotations'}
            onClick={() => setTab('annotations')}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[10px] font-medium transition ${
              tab === 'annotations'
                ? 'bg-white/[0.08] text-slate-100 shadow-sm'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            标注
            <span className="rounded bg-white/[0.06] px-1 font-mono text-[8px] text-slate-400">
              {annotations.length}
            </span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'prompt'}
            onClick={() => setTab('prompt')}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[10px] font-medium transition ${
              tab === 'prompt'
                ? 'bg-white/[0.08] text-slate-100 shadow-sm'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            Prompt
            {loading ? (
              <span className="h-2.5 w-2.5 animate-spin rounded-full border border-indigo-300/30 border-t-indigo-300" />
            ) : response ? (
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            ) : null}
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 px-3 pb-2 pt-2.5">
        {tab === 'annotations' ? (
          <AnnotationList
            annotations={annotations}
            selectedId={selectedId}
            onSelect={onSelect}
            onRemove={onRemove}
            onClear={onClear}
          />
        ) : (
          <PromptResult
            loading={loading}
            error={error}
            response={response}
            onRetry={handleGenerate}
            showToast={showToast}
          />
        )}
      </div>

      <div className="shrink-0 border-t border-white/[0.07] p-3">
        <button
          type="button"
          data-testid="generate-prompt"
          onClick={handleGenerate}
          disabled={loading}
          className="btn-primary flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-[11px] font-semibold disabled:cursor-wait disabled:opacity-70"
        >
          {loading ? (
            <>
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/25 border-t-white" />
              正在生成…
            </>
          ) : (
            <>
              <Icon name="sparkles" size={14} />
              生成指令
              <span className="ml-0.5 font-mono text-[9px] font-normal text-white/60">
                {annotations.length} 条标注
              </span>
            </>
          )}
        </button>
        <div className="mt-1.5 flex items-center justify-between px-0.5 text-[8px] text-slate-600">
          <span>输出 Markdown · 不含 Diff</span>
          <span className="max-w-[190px] truncate font-mono">
            {PROMPT_API_BASE.replace(/^https?:\/\//, '')}
          </span>
        </div>
      </div>
    </aside>
  )
}
