import { useCallback, useEffect, useState } from 'react'

import { CanvasStage } from './components/canvas/CanvasStage'
import { RightPanel } from './components/panel/RightPanel'
import { TopBar } from './components/TopBar'
import { Toast } from './components/ui/Toast'
import { useAnnotations } from './hooks/useAnnotations'
import { useIframeBridge } from './hooks/useIframeBridge'
import { usePromptGeneration } from './hooks/usePromptGeneration'
import { useToast } from './hooks/useToast'
import { PREVIEW_ORIGIN } from './lib/constants'
import type { Mode } from './types/vibe'

function App() {
  const bridge = useIframeBridge(PREVIEW_ORIGIN)
  const {
    annotations,
    selectedId,
    select,
    add,
    remove,
    undo,
    clear,
  } = useAnnotations()
  const prompt = usePromptGeneration()
  const { toast, show } = useToast()
  const [mode, setMode] = useState<Mode>('note')

  const { reset: resetPrompt, generate } = prompt

  // 标注一旦变化，旧的 Prompt 立即失效，避免复制到过期内容。
  useEffect(() => {
    resetPrompt()
  }, [annotations, resetPrompt])

  const handleGenerate = useCallback(async () => {
    if (annotations.length === 0) {
      show('请先在预览上添加至少一条标注。', 'info')
      return
    }
    const response = await generate(annotations, bridge.sessionToken)
    if (response) {
      show(
        `已生成 ${response.prompt.charCount.toLocaleString()} 字符 Prompt`,
        'success',
      )
    }
  }, [annotations, bridge.sessionToken, generate, show])

  const elementCount =
    bridge.snapshot?.meta.elementCount ?? bridge.snapshot?.elements.length ?? 0

  return (
    <div className="flex h-screen min-h-0 flex-col overflow-hidden bg-[#080a0f] text-slate-200 antialiased">
      <TopBar
        mode={mode}
        onModeChange={setMode}
        annotationCount={annotations.length}
        canUndo={annotations.length > 0}
        onUndo={undo}
        bridgeStatus={bridge.status}
        previewOrigin={PREVIEW_ORIGIN}
        elementCount={bridge.snapshot ? elementCount : null}
      />

      <div className="flex min-h-0 flex-1">
        <CanvasStage
          bridge={bridge}
          annotations={annotations}
          selectedId={selectedId}
          mode={mode}
          onModeChange={setMode}
          onAdd={add}
          onSelect={select}
          onUndo={undo}
          showToast={show}
        />

        <RightPanel
          annotations={annotations}
          selectedId={selectedId}
          loading={prompt.loading}
          error={prompt.error}
          response={prompt.response}
          onSelect={select}
          onRemove={remove}
          onClear={clear}
          onGenerate={handleGenerate}
          showToast={show}
        />
      </div>

      <Toast toast={toast} />
    </div>
  )
}

export default App
