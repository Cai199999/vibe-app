import type { RefObject } from 'react'

import { ARTBOARD_HEIGHT, ARTBOARD_WIDTH, IFRAME_HEIGHT } from '../../lib/constants'
import type { BridgeStatus } from '../../types/vibe'

interface PreviewFrameProps {
  iframeRef: RefObject<HTMLIFrameElement | null>
  status: BridgeStatus
  revision: number | null
  previewOrigin: string
}

export function PreviewFrame({
  iframeRef,
  status,
  revision,
  previewOrigin,
}: PreviewFrameProps) {
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
        <div className="mx-2 flex h-7 flex-1 items-center justify-center gap-2 rounded-md bg-white/[0.04] ring-1 ring-white/[0.06]">
          <span className="h-2 w-2 rounded-full bg-slate-500" />
          <span className="truncate font-mono text-[10px] text-slate-500">
            {previewOrigin.replace(/^https?:\/\//, '')}/mock-preview.html
          </span>
        </div>
        <span
          className={`rounded-md px-1.5 py-0.5 font-mono text-[9px] ${
            status === 'connected'
              ? 'bg-emerald-400/10 text-emerald-300'
              : status === 'error'
                ? 'bg-rose-400/10 text-rose-300'
                : 'bg-amber-400/10 text-amber-300'
          }`}
        >
          {status === 'connected'
            ? `snapshot r${revision ?? 0}`
            : status === 'error'
              ? 'bridge error'
              : 'connecting'}
        </span>
        <span className="font-mono text-[9px] text-slate-600">
          1200 × {IFRAME_HEIGHT}
        </span>
      </div>

      <iframe
        ref={iframeRef}
        src="/mock-preview.html"
        title="vibe-demo mock preview"
        className="block border-0 bg-white"
        style={{ width: ARTBOARD_WIDTH, height: IFRAME_HEIGHT }}
      />
    </section>
  )
}
