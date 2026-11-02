import type { RefObject } from 'react'

import {
  ARTBOARD_HEIGHT,
  ARTBOARD_WIDTH,
  IFRAME_HEIGHT,
} from '../../lib/constants'
import { withVibeHost } from '../../lib/project'
import type { BridgeStatus, LocalProject } from '../../types/vibe'
import { Icon } from '../ui/Icon'

interface PreviewFrameProps {
  iframeRef: RefObject<HTMLIFrameElement | null>
  project: LocalProject
  status: BridgeStatus
  onChangeProject: () => void
}

export function PreviewFrame({
  iframeRef,
  project,
  status,
  onChangeProject,
}: PreviewFrameProps) {
  const src = withVibeHost(project.url, window.location.origin)
  const displayUrl = project.url.replace(/^https?:\/\//, '')
  const dot =
    status === 'connected'
      ? 'bg-emerald-400/80'
      : status === 'idle'
        ? 'bg-slate-500'
        : 'bg-amber-400/80'

  return (
    <section
      className="absolute left-0 top-0 overflow-hidden rounded-[14px] bg-[#0f131b] shadow-[0_30px_90px_-20px_rgba(0,0,0,0.8)] ring-1 ring-white/10"
      style={{ width: ARTBOARD_WIDTH, height: ARTBOARD_HEIGHT }}
    >
      <div className="flex h-11 items-center gap-3 border-b border-white/[0.08] bg-[#0f131b] px-4">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        </div>
        <div className="mx-2 flex h-7 min-w-0 flex-1 items-center justify-center gap-2 rounded-md bg-white/[0.04] px-3 ring-1 ring-white/[0.06]">
          <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
          <span className="truncate font-mono text-[10px] text-slate-400">
            {displayUrl}
          </span>
        </div>
        <button
          type="button"
          onClick={onChangeProject}
          className="btn-ghost flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-[9px]"
          title="退出并切换模式"
        >
          <Icon name="home" size={11} />
          切换
        </button>
      </div>

      <iframe
        key={project.id}
        ref={iframeRef}
        src={src}
        title={`${project.name} local preview`}
        className="block border-0 bg-white"
        style={{ width: ARTBOARD_WIDTH, height: IFRAME_HEIGHT }}
        allow="clipboard-read; clipboard-write"
      />
    </section>
  )
}
