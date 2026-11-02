import { useRef } from 'react'

import { VISUAL_PRIVACY_WARNING } from '../lib/messages'
import { Icon, type IconName } from './ui/Icon'
import type {
  BridgeStatus,
  Mode,
  ScreenshotAsset,
} from '../types/vibe'

interface ModeOption {
  mode: Mode
  label: string
  shortcut: string
  icon: IconName
}

const MODES: ModeOption[] = [
  { mode: 'interact', label: '交互', shortcut: 'V', icon: 'cursor' },
  { mode: 'hand', label: '抓手', shortcut: 'H', icon: 'hand' },
  { mode: 'note', label: '旁注', shortcut: 'N', icon: 'note' },
  { mode: 'draw', label: '圈画', shortcut: 'P', icon: 'draw' },
  { mode: 'drag', label: '拖拽', shortcut: 'D', icon: 'drag' },
]

const VISUAL_MODES = new Set<Mode>(['interact', 'hand', 'draw'])

const STATUS_META: Record<
  BridgeStatus,
  { label: string; dot: string; text: string }
> = {
  idle: {
    label: '未加载',
    dot: 'bg-slate-500',
    text: 'text-slate-400',
  },
  connecting: {
    label: '探测中',
    dot: 'bg-amber-400',
    text: 'text-amber-300',
  },
  connected: {
    label: '源码',
    dot: 'bg-emerald-400',
    text: 'text-emerald-300',
  },
  visual: {
    label: '视觉',
    dot: 'bg-amber-400',
    text: 'text-amber-300',
  },
}

interface TopBarProps {
  mode: Mode
  onModeChange: (mode: Mode) => void
  annotationCount: number
  canUndo: boolean
  onUndo: () => void
  bridgeStatus: BridgeStatus
  bridgeError: string | null
  previewOrigin: string | null
  projectName: string | null
  /** null 表示握手成功但快照尚未到达。 */
  elementCount: number | null
  screenshot: ScreenshotAsset | null
  screenshotLoading: boolean
  onUploadScreenshot: (file: File) => void
  onRemoveScreenshot: () => void
  onExit: () => void
}

export function TopBar({
  mode,
  onModeChange,
  annotationCount,
  canUndo,
  onUndo,
  bridgeStatus,
  bridgeError,
  previewOrigin,
  projectName,
  elementCount,
  screenshot,
  screenshotLoading,
  onUploadScreenshot,
  onRemoveScreenshot,
  onExit,
}: TopBarProps) {
  const status = STATUS_META[bridgeStatus]
  const fileInputRef = useRef<HTMLInputElement>(null)
  const visualMode = bridgeStatus === 'visual'
  const modes = visualMode
    ? MODES.filter((option) => VISUAL_MODES.has(option.mode))
    : MODES

  const statusTitle =
    bridgeStatus === 'connected'
      ? elementCount === null
        ? '握手成功，正在同步快照'
        : `已同步 ${elementCount} 个 data-source 节点`
      : bridgeStatus === 'visual'
        ? bridgeError ?? '仅视觉模式：上传截图后生成 Prompt'
        : bridgeStatus === 'idle'
          ? '尚未加载项目'
          : '正在探测项目内的 Vibe SDK（3 秒）'

  return (
    <header className="relative z-40 flex h-[60px] shrink-0 items-center gap-3 border-b border-white/[0.08] bg-[#0c0f15] px-3">
      <div className="flex w-[230px] min-w-0 shrink-0 items-center gap-2.5">
        <div className="logo-mark">
          <Icon name="sparkles" size={16} />
        </div>
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold tracking-tight text-white">
            Vibe Canvas
          </div>
        </div>
        {previewOrigin && (
          <div className="ml-1 hidden min-w-0 items-center gap-1.5 rounded-lg bg-white/[0.04] px-2 py-1 ring-1 ring-white/[0.08] 2xl:flex">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${status.dot}`} />
            <span className="truncate font-mono text-[9px] text-slate-400">
              {previewOrigin.replace(/^https?:\/\//, '')}
            </span>
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 justify-center">
        <div
          className="flex items-center gap-0.5 overflow-x-auto rounded-xl bg-white/[0.04] p-1 ring-1 ring-white/[0.08]"
          role="toolbar"
          aria-label="画布模式"
        >
          {modes.map((option, index) => (
            <span key={option.mode} className="contents">
              {index === 2 && !visualMode && (
                <span className="mx-1 h-4 w-px bg-white/10" />
              )}
              <button
                type="button"
                onClick={() => onModeChange(option.mode)}
                aria-pressed={mode === option.mode}
                data-mode={option.mode}
                className={`mode-btn ${mode === option.mode ? 'is-active' : ''}`}
                title={`${option.label}模式 (${option.shortcut})`}
              >
                <Icon name={option.icon} size={12} />
                {option.label}
                <kbd>{option.shortcut}</kbd>
              </button>
            </span>
          ))}

          {visualMode && (
            <>
              <span className="mx-1 h-4 w-px bg-white/10" />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                data-testid="screenshot-file-input"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) onUploadScreenshot(file)
                  // 允许连续选择同一张图片时仍触发 change。
                  event.target.value = ''
                }}
              />
              <button
                type="button"
                data-testid="screenshot-upload"
                onClick={() => fileInputRef.current?.click()}
                disabled={screenshotLoading}
                className="mode-btn whitespace-nowrap disabled:opacity-50"
                title="上传截图，或按 Ctrl / ⌘ + V 粘贴（仅本机内存）"
              >
                {screenshot ? (
                  <img
                    src={screenshot.dataUrl}
                    alt="当前截图缩略图"
                    className="h-4 w-5 rounded-sm object-cover ring-1 ring-white/15"
                  />
                ) : (
                  <Icon name="image" size={12} />
                )}
                {screenshotLoading ? '处理中' : screenshot ? '截图' : '上传'}
              </button>
              {screenshot && (
                <button
                  type="button"
                  data-testid="screenshot-clear"
                  onClick={onRemoveScreenshot}
                  className="mode-btn px-1.5 text-slate-500 hover:text-rose-300"
                  title="移除截图"
                  aria-label="移除截图"
                >
                  <Icon name="close" size={11} />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="flex w-[330px] shrink-0 items-center justify-end gap-1.5">
        {visualMode && (
          <span
            data-testid="visual-privacy-warning"
            title={VISUAL_PRIVACY_WARNING}
            aria-label={VISUAL_PRIVACY_WARNING}
            className="grid h-7 w-7 place-items-center rounded-full text-amber-300/70 transition hover:bg-amber-400/10 hover:text-amber-200"
          >
            <Icon name="lock" size={12} />
          </span>
        )}

        <span
          data-testid="bridge-status"
          aria-label={statusTitle}
          title={statusTitle}
          className={`hidden items-center gap-1.5 whitespace-nowrap rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 font-mono text-[9px] md:inline-flex ${status.text}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
          {status.label}
          {bridgeStatus === 'connected' && elementCount !== null && (
            <span className="text-slate-500">{elementCount}</span>
          )}
        </span>

        <span className="hidden max-w-[96px] items-center gap-1.5 truncate rounded-full border border-indigo-400/20 bg-indigo-400/10 px-2.5 py-1 text-[9px] font-medium text-indigo-200 lg:inline-flex">
          {projectName ?? '未加载'}
        </span>

        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          className="btn-ghost grid h-8 w-8 place-items-center rounded-lg disabled:opacity-30"
          title="撤销上一条标注 (⌘/Ctrl + Z)"
          aria-label="撤销上一条标注"
        >
          <Icon name="undo" size={14} />
        </button>

        <span className="grid h-7 min-w-7 place-items-center rounded-lg bg-white/[0.06] px-2 text-[10px] font-semibold text-slate-300">
          {annotationCount}
        </span>

        <button
          type="button"
          data-testid="exit-workspace"
          onClick={onExit}
          className="btn-ghost ml-0.5 grid h-8 w-8 place-items-center rounded-lg"
          title="退出并切换模式"
          aria-label="退出并切换模式"
        >
          <Icon name="home" size={14} />
        </button>
      </div>
    </header>
  )
}
