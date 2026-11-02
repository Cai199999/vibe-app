/** 用户手动上传截图的前端规范化与红笔轨迹合成。 */

import {
  ARTBOARD_WIDTH,
  IFRAME_HEIGHT,
  IFRAME_ORIGIN,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_EDGE,
} from './constants'
import type {
  CanvasAnnotation,
  Point,
  Rect,
  ScreenshotAsset,
  VisualDrawAnnotation,
} from '../types/vibe'

const ACCEPTED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp'])
const MAX_SOURCE_FILE_BYTES = 20 * 1024 * 1024
const PNG_PREFIX = 'data:image/png;base64,'
const RED_STROKE = '#ef4444'

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
      } else {
        reject(new Error('无法读取截图文件。'))
      }
    }
    reader.onerror = () => reject(new Error('无法读取截图文件。'))
    reader.readAsDataURL(file)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('截图不是有效的图片。'))
    image.src = src
  })
}

export function dataUrlByteSize(dataUrl: string): number {
  const comma = dataUrl.indexOf(',')
  if (comma < 0) return 0
  try {
    return atob(dataUrl.slice(comma + 1)).length
  } catch {
    return 0
  }
}

/**
 * 截图在 1200×772 预览区域内的实际显示矩形（iframe 视口坐标）。
 * CSS 使用 object-contain，因此这里必须与画面保持同一套等比缩放逻辑，
 * 否则红笔轨迹在合成图中会与用户看到的截图错位。
 */
export function screenshotViewportRect(
  screenshot: ScreenshotAsset,
): Rect {
  const width = Math.max(1, screenshot.width)
  const height = Math.max(1, screenshot.height)
  const scale = Math.min(
    ARTBOARD_WIDTH / width,
    IFRAME_HEIGHT / height,
  )
  const displayWidth = width * scale
  const displayHeight = height * scale
  return {
    x: (ARTBOARD_WIDTH - displayWidth) / 2,
    y: (IFRAME_HEIGHT - displayHeight) / 2,
    width: displayWidth,
    height: displayHeight,
  }
}

function drawNormalized(
  context: CanvasRenderingContext2D,
  normalized: Point[],
  width: number,
  height: number,
): void {
  if (normalized.length === 0) return
  const lineWidth = Math.max(
    5,
    Math.round(Math.max(width, height) * 0.006),
  )
  context.strokeStyle = RED_STROKE
  context.fillStyle = RED_STROKE
  context.lineWidth = lineWidth
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.globalAlpha = 0.96

  if (normalized.length === 1) {
    const point = normalized[0]
    context.beginPath()
    context.arc(
      point.x * width,
      point.y * height,
      lineWidth * 0.7,
      0,
      Math.PI * 2,
    )
    context.fill()
    return
  }

  context.beginPath()
  normalized.forEach((point, index) => {
    const x = point.x * width
    const y = point.y * height
    if (index === 0) context.moveTo(x, y)
    else context.lineTo(x, y)
  })
  context.stroke()
}

function visualAnnotations(
  annotations: CanvasAnnotation[],
): VisualDrawAnnotation[] {
  return annotations.filter(
    (annotation): annotation is VisualDrawAnnotation =>
      annotation.type === 'visual-draw',
  )
}

function toNormalizedPoints(
  annotation: VisualDrawAnnotation,
  display: Rect,
): Point[] {
  return annotation.visual.rawPoints.map((point) => ({
    x: (point.x - display.x) / display.width,
    y: (point.y - IFRAME_ORIGIN.y - display.y) / display.height,
  }))
}

function encodeWithLimit(
  image: HTMLImageElement,
  annotations: VisualDrawAnnotation[],
  display: Rect,
): string {
  let scale = 1
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const width = Math.max(1, Math.round(image.width * scale))
    const height = Math.max(1, Math.round(image.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('浏览器无法创建图像合成画布。')

    context.drawImage(image, 0, 0, width, height)
    for (const annotation of annotations) {
      drawNormalized(
        context,
        toNormalizedPoints(annotation, display),
        width,
        height,
      )
    }

    const dataUrl = canvas.toDataURL('image/png')
    if (dataUrlByteSize(dataUrl) <= MAX_IMAGE_BYTES) return dataUrl
    scale *= 0.82
  }
  throw new Error('合成截图压缩后仍超过 1 MB，请换一张更小的截图。')
}

/**
 * 读取上传图片，缩放到后端允许的边长与体积，并统一编码为 PNG。
 * 这一步只发生在浏览器内存中，截图不会落盘。
 */
export async function normalizeScreenshot(
  file: File,
): Promise<ScreenshotAsset> {
  if (!ACCEPTED_MIME.has(file.type)) {
    throw new Error('仅支持 PNG / JPEG / WebP 截图。')
  }
  if (file.size > MAX_SOURCE_FILE_BYTES) {
    throw new Error('原始截图超过 20 MB，请先压缩后再上传。')
  }

  const sourceDataUrl = await readAsDataUrl(file)
  const image = await loadImage(sourceDataUrl)
  if (!image.width || !image.height) {
    throw new Error('截图尺寸无效。')
  }

  let scale = Math.min(
    1,
    MAX_IMAGE_EDGE / Math.max(image.width, image.height),
  )
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const width = Math.max(1, Math.round(image.width * scale))
    const height = Math.max(1, Math.round(image.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('浏览器无法创建图像处理画布。')
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(image, 0, 0, width, height)

    const dataUrl = canvas.toDataURL('image/png')
    const bytes = dataUrlByteSize(dataUrl)
    if (bytes <= MAX_IMAGE_BYTES) {
      return {
        dataUrl,
        width,
        height,
        bytes,
        name: file.name || 'pasted-screenshot.png',
      }
    }
    scale *= 0.82
  }

  throw new Error('截图压缩后仍超过 1 MB，请换一张更小的截图。')
}

/**
 * 把截图与所有仅视觉圈画合成为一张 PNG。
 * 红色轨迹按用户在画布上的实际位置映射到原图像素坐标。
 */
export async function composeScreenshotWithDrawings(
  screenshot: ScreenshotAsset,
  annotations: CanvasAnnotation[],
): Promise<string> {
  const image = await loadImage(screenshot.dataUrl)
  const visual = visualAnnotations(annotations)
  if (visual.length === 0 && screenshot.dataUrl.startsWith(PNG_PREFIX)) {
    return screenshot.dataUrl
  }
  const display = screenshotViewportRect(screenshot)
  return encodeWithLimit(image, visual, display)
}
