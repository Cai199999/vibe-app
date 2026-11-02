import { useState } from 'react'

import type { ToastTone } from '../../hooks/useToast'
import type { PromptErrorState } from '../../hooks/usePromptGeneration'
import { VISUAL_REQUIRE_SCREENSHOT_MESSAGE } from '../../lib/messages'
import type { CanvasAnnotation, PromptResponse } from '../../types/vibe'
import { Icon } from '../ui/Icon'
import { AnnotationList } from './AnnotationList'
import { PromptResult } from './PromptResult'

type Tab = 'annotations' | 'prompt'

interface RightPanelProps {
  collapsed: boolean
  annotations: CanvasAnnotation[]
  selectedId: string | null
  /** 仅视觉模式：必须已有截图才能生成。 */
  visualMode: boolean
  hasScreenshot: boolean
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
  collapsed,
  annotations,
  selectedId,
  visualMode,
  hasScreenshot,
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
    if (visualMode) {
      // 视觉模式允许 0 条标注（仅凭截图），但必须先有截图。
      if (!hasScreenshot) {
        setTab('annotations')
        showToast(VISUAL_REQUIRE_SCREENSHOT_MESSAGE, 'error')
        return
      }
      setTab('prompt')
      void onGenerate()
      return
    }
    if (annotations.length === 0) {
      setTab('annotations')
      showToast('请先添加标注。', 'info')
      return
    }
    setTab('prompt')
    void onGenerate()
  }

  return (
    <aside
      id="prompt-workbench"
      data-testid="right-panel"
      aria-hidden={collapsed}
      inert={collapsed}
      className={`flex shrink-0 flex-col overflow-hidden border-white/[0.08] bg-[#0b0e14] transition-[width,border-width] duration-200 ${
        collapsed
          ? 'w-0 border-l-0'
          : 'w-[400px] border-l xl:w-[420px]'
      }`}
    >
      <div className="flex h-full w-[400px] shrink-0 flex-col xl:w-[420px]">
      <div className="shrink-0 border-b border-white/[0.07] p-2.5">
        <div
          className="flex rounded-lg bg-white/[0.035] p-0.5 ring-1 ring-white/[0.06]"
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
            visualMode={visualMode}
            hasScreenshot={hasScreenshot}
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
                {visualMode
                  ? hasScreenshot
                    ? '视觉'
                    : '无截图'
                  : `${annotations.length} 条`}
              </span>
            </>
          )}
        </button>
      </div>
      </div>
    </aside>
  )
}
