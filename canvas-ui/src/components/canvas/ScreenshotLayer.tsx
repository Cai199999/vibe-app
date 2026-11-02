import {
  ARTBOARD_WIDTH,
  IFRAME_HEIGHT,
  IFRAME_ORIGIN,
} from '../../lib/constants'
import { screenshotViewportRect } from '../../lib/screenshot'
import type { ScreenshotAsset } from '../../types/vibe'

interface ScreenshotLayerProps {
  screenshot: ScreenshotAsset
}

/**
 * 视觉模式下覆盖在 iframe 上的截图标注层。
 * 图片用 object-contain 等比展示；合成红笔轨迹时使用同一套显示矩形。
 */
export function ScreenshotLayer({ screenshot }: ScreenshotLayerProps) {
  const rect = screenshotViewportRect(screenshot)

  return (
    <div
      data-testid="screenshot-layer"
      className="pointer-events-none absolute left-0 z-[5] overflow-hidden bg-[#06080d]"
      style={{
        top: IFRAME_ORIGIN.y,
        width: ARTBOARD_WIDTH,
        height: IFRAME_HEIGHT,
      }}
    >
      <img
        data-testid="screenshot-preview"
        src={screenshot.dataUrl}
        alt="用户上传的待标注截图"
        draggable={false}
        className="absolute select-none object-contain"
        style={{
          left: rect.x,
          top: rect.y,
          width: rect.width,
          height: rect.height,
        }}
      />
    </div>
  )
}
