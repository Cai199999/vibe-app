import { useCallback, useEffect, useState } from 'react'

import { CanvasStage } from './components/canvas/CanvasStage'
import { RightPanel } from './components/panel/RightPanel'
import { TopBar } from './components/TopBar'
import { Icon } from './components/ui/Icon'
import { Toast } from './components/ui/Toast'
import { useAnnotations } from './hooks/useAnnotations'
import { useIframeBridge } from './hooks/useIframeBridge'
import { usePromptGeneration } from './hooks/usePromptGeneration'
import { useScreenshot } from './hooks/useScreenshot'
import { useToast } from './hooks/useToast'
import { composeScreenshotWithDrawings } from './lib/screenshot'
import { VISUAL_REQUIRE_SCREENSHOT_MESSAGE } from './lib/messages'
import type { LocalProject, Mode } from './types/vibe'

function App() {
  const [project, setProject] = useState<LocalProject | null>(null)
  const [mode, setMode] = useState<Mode>('note')
  const [panelOpen, setPanelOpen] = useState(true)
  const [preparing, setPreparing] = useState(false)

  const bridge = useIframeBridge(
    project?.origin ?? null,
    project?.id ?? null,
  )
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
  const visualMode = bridge.status === 'visual'
  const {
    screenshot,
    loading: screenshotLoading,
    loadFile: loadScreenshot,
    clear: clearScreenshot,
  } = useScreenshot(visualMode, show)

  const { reset: resetPrompt, generate } = prompt

  // 标注一旦变化，旧的 Prompt 立即失效，避免复制到过期内容。
  useEffect(() => {
    resetPrompt()
  }, [annotations, resetPrompt])

  // 降级或更换截图后，旧 Prompt 不再可信，立即清空。
  useEffect(() => {
    resetPrompt()
  }, [bridge.status, screenshot?.dataUrl, resetPrompt])

  const handleLoadProject = useCallback(
    (next: LocalProject) => {
      setProject(next)
      // 不同项目的 data-source、截图与源码片段不可混用。
      clear()
      clearScreenshot()
      resetPrompt()
      show(`已加载 ${next.origin}，等待 SDK 握手…`, 'info')
    },
    [clear, clearScreenshot, resetPrompt, show],
  )

  const handleChangeProject = useCallback(() => {
    setProject(null)
    clear()
    clearScreenshot()
    resetPrompt()
    show('已卸载当前项目，可重新输入本地地址。', 'info')
  }, [clear, clearScreenshot, resetPrompt, show])

  const handleGenerate = useCallback(async () => {
    if (!project) {
      show('请先加载本地项目。', 'info')
      return
    }

    if (visualMode) {
      if (!screenshot) {
        show(VISUAL_REQUIRE_SCREENSHOT_MESSAGE, 'error')
        return
      }
      setPreparing(true)
      try {
        // 在浏览器内把原图与红笔轨迹合成为一张 PNG，再交给后端。
        const imageBase64 = await composeScreenshotWithDrawings(
          screenshot,
          annotations,
        )
        const response = await generate(
          annotations,
          bridge.sessionToken,
          project,
          imageBase64,
        )
        if (response) {
          show(
            `已用视觉截图生成 ${response.prompt.charCount.toLocaleString()} 字符 Prompt`,
            'success',
          )
        }
      } catch (error) {
        show(
          error instanceof Error ? error.message : '截图合成失败，请重试。',
          'error',
        )
      } finally {
        setPreparing(false)
      }
      return
    }

    if (bridge.status !== 'connected') {
      show('正在探测源码插件，请稍候；3 秒后会给出结果。', 'info')
      return
    }
    if (annotations.length === 0) {
      show('请先在预览上添加至少一条标注。', 'info')
      return
    }
    const response = await generate(
      annotations,
      bridge.sessionToken,
      project,
    )
    if (response) {
      show(
        `已生成 ${response.prompt.charCount.toLocaleString()} 字符 Prompt`,
        'success',
      )
    }
  }, [
    annotations,
    bridge.sessionToken,
    bridge.status,
    generate,
    project,
    screenshot,
    show,
    visualMode,
  ])

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
        previewOrigin={project?.origin ?? null}
        projectName={project?.name ?? null}
        elementCount={bridge.snapshot ? elementCount : null}
        screenshot={screenshot}
        screenshotLoading={screenshotLoading}
        onUploadScreenshot={(file) => void loadScreenshot(file)}
        onRemoveScreenshot={clearScreenshot}
      />

      <div className="relative flex min-h-0 flex-1">
        <CanvasStage
          bridge={bridge}
          project={project}
          screenshot={screenshot}
          onLoadProject={handleLoadProject}
          onChangeProject={handleChangeProject}
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
          collapsed={!panelOpen}
          annotations={annotations}
          selectedId={selectedId}
          visualMode={visualMode}
          hasScreenshot={Boolean(screenshot)}
          loading={prompt.loading || preparing}
          error={prompt.error}
          response={prompt.response}
          onSelect={select}
          onRemove={remove}
          onClear={clear}
          onGenerate={handleGenerate}
          showToast={show}
        />

        {/* 折叠把手贴在右侧工作台左边缘；收起后仍可见，便于恢复。 */}
        <button
          type="button"
          data-testid="toggle-panel"
          onClick={() => setPanelOpen((open) => !open)}
          aria-expanded={panelOpen}
          aria-controls="prompt-workbench"
          title={panelOpen ? '收起 Prompt 工作台' : '展开 Prompt 工作台'}
          className={`absolute top-1/2 z-50 grid h-16 w-6 -translate-y-1/2 place-items-center rounded-l-lg border border-r-0 border-white/[0.1] bg-[#11151d]/95 text-slate-400 shadow-xl backdrop-blur transition-[right,color,background-color] duration-200 hover:bg-[#171c26] hover:text-white ${
            panelOpen
              ? 'right-[400px] xl:right-[420px]'
              : 'right-0'
          }`}
        >
          <Icon
            name={panelOpen ? 'chevronRight' : 'chevronLeft'}
            size={12}
          />
          <span className="sr-only">
            {panelOpen ? '收起 Prompt 工作台' : '展开 Prompt 工作台'}
          </span>
        </button>
      </div>

      <Toast toast={toast} />
    </div>
  )
}

export default App
