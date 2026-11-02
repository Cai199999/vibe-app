import type { WorldTarget } from '../../types/vibe'

interface HoverBoxProps {
  target: WorldTarget
  zoom: number
}

export function HoverBox({ target, zoom }: HoverBoxProps) {
  return (
    <div
      className="pointer-events-none absolute z-30 rounded-[9px] border-[1.5px] border-indigo-400/90 bg-indigo-500/[0.07]"
      style={{
        left: target.rect.x,
        top: target.rect.y,
        width: Math.max(1, target.rect.width),
        height: Math.max(1, target.rect.height),
      }}
    >
      <div
        className="absolute -top-6 left-0 origin-bottom-left whitespace-nowrap rounded-md bg-indigo-500 px-2 py-1 font-mono text-[9px] leading-none text-white shadow-lg"
        style={{ transform: `scale(${1 / zoom})` }}
      >
        {target.component ?? 'Element'} · {target.source}
      </div>
    </div>
  )
}
