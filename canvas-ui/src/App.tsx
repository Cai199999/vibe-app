import { useCallback, useEffect, useState } from 'react'

import { CanvasStage } from './components/canvas/CanvasStage'
import { LandingPage } from './components/landing/LandingPage'
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

type Workspace = 'landing' | 'source' | 'visual'

/**
 * 截图工作区没有真实项目，但仍需要构造 L3 请求的项目元信息。
 * 使用固定回环 Origin，既符合后端预览地址校验，也不会产生真实网络请求。
 */
const SCREENSHOT_PROJECT: LocalProject = {
  id: 'prj_screenshot_workspace',
  name: '截图工作区',
  url: 'http://127.0.0.1:5173/',
  origin: 'http://127.0.0.1:5173',
  loadedAt: '2026-01-01T00:00:00.000Z',
}

function App() {
  const [workspace, setWorkspace] = useState<Workspace>('landing')
  const [project, setProject] = useState<LocalProject | null>(null)
  const [mode, setMode] = useState<Mode>('note')
  const [panelOpen, setPanelOpen] = useState(true)
  const [preparing, setPreparing] = useState(false)

  const bridge = useIframeBridge(
    project?.origin ?? null,
    project?.id ?? null,
    workspace === 'visual',
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
  const visualMode = workspace === 'visual' || bridge.status === 'visual'
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

  const handleEnterSource = useCallback(
    (next: LocalProject) => {
      setWorkspace('source')
      setProject(next)
      setMode('note')
      // 不同项目的 data-source、截图与源码片段不可混用。
      clear()
      clearScreenshot()
      resetPrompt()
    },
    [clear, clearScreenshot, resetPrompt],
  )

  const handleEnterVisual = useCallback(() => {
    setWorkspace('visual')
    setProject(null)
    setMode('draw')
    clear()
    clearScreenshot()
    resetPrompt()
  }, [clear, clearScreenshot, resetPrompt])

  const handleExitWorkspace = useCallback(() => {
    setWorkspace('landing')
    setProject(null)
    setMode('note')
    setPreparing(false)
    clear()
    clearScreenshot()
    resetPrompt()
  }, [clear, clearScreenshot, resetPrompt])

  const handleModeChange = useCallback(
    (next: Mode) => {
      if (visualMode && (next === 'note' || next === 'drag')) return
      setMode(next)
    },
    [visualMode],
  )

  const handleGenerate = useCallback(async () => {
    const activeProject =
      project ?? (workspace === 'visual' ? SCREENSHOT_PROJECT : null)
    if (!activeProject) {
      show('请先选择工作模式。', 'info')
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
        await generate(
          annotations,
          bridge.sessionToken,
          activeProject,
          imageBase64,
        )
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
      show('源码探测中，请稍候。', 'info')
      return
    }
    if (annotations.length === 0) {
      show('请先添加标注。', 'info')
      return
    }
    await generate(annotations, bridge.sessionToken, activeProject)
  }, [
    annotations,
    bridge.sessionToken,
    bridge.status,
    generate,
    project,
    screenshot,
    show,
    visualMode,
    workspace,
  ])

  if (workspace === 'landing') {
    return (
      <LandingPage
        onEnterSource={handleEnterSource}
        onEnterVisual={handleEnterVisual}
      />
    )
  }

  const elementCount =
    bridge.snapshot?.meta.elementCount ?? bridge.snapshot?.elements.length ?? 0
  const projectName =
    project?.name ?? (workspace === 'visual' ? SCREENSHOT_PROJECT.name : null)
  // 仅视觉模式不支持旁注 / 拖拽；降级瞬间直接按圈画处理，不额外派发状态更新。
  const activeMode: Mode =
    visualMode && (mode === 'note' || mode === 'drag') ? 'draw' : mode

  return (
    <div className="flex h-screen min-h-0 flex-col overflow-hidden bg-[#080a0f] text-slate-200 antialiased">
      <TopBar
        mode={activeMode}
        onModeChange={handleModeChange}
        annotationCount={annotations.length}
        canUndo={annotations.length > 0}
        onUndo={undo}
        bridgeStatus={bridge.status}
        bridgeError={bridge.lastError}
        previewOrigin={project?.origin ?? null}
        projectName={projectName}
        elementCount={bridge.snapshot ? elementCount : null}
        screenshot={screenshot}
        screenshotLoading={screenshotLoading}
        onUploadScreenshot={(file) => void loadScreenshot(file)}
        onRemoveScreenshot={clearScreenshot}
        onExit={handleExitWorkspace}
      />

      <div className="relative flex min-h-0 flex-1">
        <CanvasStage
          bridge={bridge}
          workspace={workspace}
          project={project}
          screenshot={screenshot}
          onChangeProject={handleExitWorkspace}
          annotations={annotations}
          selectedId={selectedId}
          mode={activeMode}
          onModeChange={handleModeChange}
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
          title={panelOpen ? '收起工作台' : '展开工作台'}
          className={`absolute top-1/2 z-50 grid h-16 w-6 -translate-y-1/2 place-items-center rounded-l-lg border border-r-0 border-white/[0.1] bg-[#11151d]/95 text-slate-400 shadow-xl backdrop-blur transition-[right,color,background-color] duration-200 hover:bg-[#171c26] hover:text-white ${
            panelOpen ? 'right-[400px] xl:right-[420px]' : 'right-0'
          }`}
        >
          <Icon
            name={panelOpen ? 'chevronRight' : 'chevronLeft'}
            size={12}
          />
          <span className="sr-only">
            {panelOpen ? '收起工作台' : '展开工作台'}
          </span>
        </button>
      </div>

      <Toast toast={toast} />
    </div>
  )
}

export default App
