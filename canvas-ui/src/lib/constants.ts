/** 画布尺寸、协议版本与本地运行配置。 */

export const PROTOCOL_VERSION = '0.1'
export const PROTOCOL_MAJOR = '0'

export const ARTBOARD_WIDTH = 1200
export const TITLEBAR_HEIGHT = 44
export const IFRAME_HEIGHT = 772
export const ARTBOARD_HEIGHT = TITLEBAR_HEIGHT + IFRAME_HEIGHT
export const IFRAME_ORIGIN = { x: 0, y: TITLEBAR_HEIGHT }

export const MAX_RAW_POINTS = 5000
export const MAX_KEY_POINTS = 100
export const MAX_SNIPPET_LINES = 40
export const MAX_SNIPPET_BYTES = 4096
export const MAX_PROMPT_CHARS = 12000

/** 与后端 MAX_IMAGE_BYTES / MAX_IMAGE_EDGE 保持一致。 */
export const MAX_IMAGE_BYTES = 1024 * 1024
export const MAX_IMAGE_EDGE = 1600

export const PROMPT_API_BASE = (
  import.meta.env.VITE_PROMPT_API_BASE || 'http://127.0.0.1:8000'
).replace(/\/$/, '')

export const DEFAULT_CANVAS_CONFIG = {
  maxSnapshotElements: 200,
  maxTextLength: 200,
  maxNeighbors: 6,
  maxSnippetLines: MAX_SNIPPET_LINES,
  maxSnippetBytes: MAX_SNIPPET_BYTES,
  snapshotDebounceMs: 150,
}
