import { Icon } from '../ui/Icon'

interface CanvasControlsProps {
  zoom: number
  onZoomIn: () => void
  onZoomOut: () => void
  onReset: () => void
  onFit: () => void
}

export function CanvasControls({
  zoom,
  onZoomIn,
  onZoomOut,
  onReset,
  onFit,
}: CanvasControlsProps) {
  return (
    <div className="absolute bottom-4 left-4 z-40 flex items-center gap-0.5 rounded-xl border border-white/10 bg-[#0c0f15]/90 p-1 shadow-xl backdrop-blur">
      <button
        type="button"
        onClick={onZoomOut}
        className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white"
        title="缩小"
        aria-label="缩小"
      >
        <Icon name="minus" size={13} />
      </button>
      <button
        type="button"
        onClick={onReset}
        className="h-7 min-w-[52px] rounded-lg px-1 font-mono text-[10px] text-slate-300 hover:bg-white/10"
        title="重置为 100%"
      >
        {Math.round(zoom * 100)}%
      </button>
      <button
        type="button"
        onClick={onZoomIn}
        className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white"
        title="放大"
        aria-label="放大"
      >
        <Icon name="plus" size={13} />
      </button>
      <span className="mx-1 h-4 w-px bg-white/10" />
      <button
        type="button"
        onClick={onFit}
        className="grid h-7 place-items-center rounded-lg px-2 text-slate-400 hover:bg-white/10 hover:text-white"
        title="适应画布"
        aria-label="适应画布"
      >
        <Icon name="fit" size={13} />
      </button>
    </div>
  )
}
