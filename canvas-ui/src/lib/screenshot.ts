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
/** 超过 2 MB 的原始截图在合成时优先使用 JPEG 压缩。 */
const LARGE_SOURCE_BYTES = 2 * 1024 * 1024
const CROP_PADDING_RATIO = 0.2
const JPEG_QUALITY = 0.8
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

function drawPoints(
  context: CanvasRenderingContext2D,
  points: Point[],
  lineWidth: number,
): void {
  if (points.length === 0) return
  context.strokeStyle = RED_STROKE
  context.fillStyle = RED_STROKE
  context.lineWidth = lineWidth
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.globalAlpha = 0.96

  if (points.length === 1) {
    const point = points[0]
    context.beginPath()
    context.arc(point.x, point.y, lineWidth * 0.7, 0, Math.PI * 2)
    context.fill()
    return
  }

  context.beginPath()
  points.forEach((point, index) => {
    if (index === 0) context.moveTo(point.x, point.y)
    else context.lineTo(point.x, point.y)
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

/**
 * 所有红圈包围盒的并集（画布世界坐标）。
 * 多个圈画合并成一个裁剪区域，避免逐条裁剪产生多张图。
 */
function unionVisualBbox(
  annotations: VisualDrawAnnotation[],
): Rect | null {
  let left = Number.POSITIVE_INFINITY
  let top = Number.POSITIVE_INFINITY
  let right = Number.NEGATIVE_INFINITY
  let bottom = Number.NEGATIVE_INFINITY

  for (const annotation of annotations) {
    const bbox = annotation.visual.bbox
    left = Math.min(left, bbox.x)
    top = Math.min(top, bbox.y)
    right = Math.max(right, bbox.x + bbox.width)
    bottom = Math.max(bottom, bbox.y + bbox.height)
  }

  if (!Number.isFinite(left) || right <= left || bottom <= top) {
    return null
  }
  return { x: left, y: top, width: right - left, height: bottom - top }
}

/**
 * 将红圈包围盒映射到截图像素坐标，并向四周各扩 20%。
 * 额外加上红笔线宽，保证圆圈边缘不会被裁掉。
 */
export function screenshotCropRect(
  screenshot: ScreenshotAsset,
  annotations: VisualDrawAnnotation[],
): Rect | null {
  const bbox = unionVisualBbox(annotations)
  if (!bbox) return null

  const display = screenshotViewportRect(screenshot)
  const scaleX = screenshot.width / display.width
  const scaleY = screenshot.height / display.height
  const strokePadding = Math.max(
    5,
    Math.round(Math.max(screenshot.width, screenshot.height) * 0.006),
  )

  let left = (bbox.x - display.x) * scaleX - strokePadding
  let top =
    (bbox.y - IFRAME_ORIGIN.y - display.y) * scaleY - strokePadding
  let right =
    (bbox.x + bbox.width - display.x) * scaleX + strokePadding
  let bottom =
    (bbox.y + bbox.height - IFRAME_ORIGIN.y - display.y) * scaleY +
    strokePadding

  // 向外各扩 20%（宽高分别按包围盒尺寸计算），再夹到图片边界内。
  const padX = (right - left) * CROP_PADDING_RATIO
  const padY = (bottom - top) * CROP_PADDING_RATIO
  left = Math.max(0, Math.floor(left - padX))
  top = Math.max(0, Math.floor(top - padY))
  right = Math.min(screenshot.width, Math.ceil(right + padX))
  bottom = Math.min(screenshot.height, Math.ceil(bottom + padY))

  if (right - left < 2 || bottom - top < 2) return null
  return { x: left, y: top, width: right - left, height: bottom - top }
}

function drawAnnotationOnCrop(
  context: CanvasRenderingContext2D,
  annotation: VisualDrawAnnotation,
  display: Rect,
  crop: Rect,
  image: HTMLImageElement,
  outputWidth: number,
  outputHeight: number,
  lineWidth: number,
): void {
  const scaleX = outputWidth / crop.width
  const scaleY = outputHeight / crop.height
  const points = toNormalizedPoints(annotation, display).map((point) => ({
    x: (point.x * image.width - crop.x) * scaleX,
    y: (point.y * image.height - crop.y) * scaleY,
  }))
  drawPoints(context, points, lineWidth)
}

function encodeWithLimit(
  image: HTMLImageElement,
  annotations: VisualDrawAnnotation[],
  display: Rect,
  crop: Rect,
  preferJpeg: boolean,
): string {
  // 大图优先 JPEG 0.8；普通截图先用 PNG，超限再自动降级为 JPEG。
  let mime: 'image/png' | 'image/jpeg' = preferJpeg
    ? 'image/jpeg'
    : 'image/png'
  let quality = JPEG_QUALITY
  let scale = 1
  const baseLineWidth = Math.max(
    5,
    Math.round(Math.max(image.width, image.height) * 0.006),
  )

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const width = Math.max(1, Math.round(crop.width * scale))
    const height = Math.max(1, Math.round(crop.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('浏览器无法创建图像合成画布。')

    // JPEG 没有透明通道，先铺白底，避免裁剪边缘出现黑边。
    if (mime === 'image/jpeg') {
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, width, height)
    }
    context.drawImage(
      image,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      0,
      0,
      width,
      height,
    )

    const lineWidth = Math.max(3, baseLineWidth * (width / crop.width))
    for (const annotation of annotations) {
      drawAnnotationOnCrop(
        context,
        annotation,
        display,
        crop,
        image,
        width,
        height,
        lineWidth,
      )
    }

    const dataUrl = canvas.toDataURL(mime, quality)
    if (dataUrlByteSize(dataUrl) <= MAX_IMAGE_BYTES) return dataUrl

    if (mime === 'image/png') {
      // 先不牺牲分辨率，尝试 JPEG 0.8。
      mime = 'image/jpeg'
      quality = JPEG_QUALITY
      continue
    }

    scale *= 0.85
    quality = Math.max(0.5, JPEG_QUALITY - attempt * 0.02)
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
        sourceBytes: file.size,
        name: file.name || 'pasted-screenshot.png',
      }
    }
    scale *= 0.82
  }

  throw new Error('截图压缩后仍超过 1 MB，请换一张更小的截图。')
}

/**
 * 把截图与所有仅视觉圈画合成为一张图。
 *
 * - 有红圈：取所有圈的并集包围盒，向四周扩 20% 后裁剪，仅发送局部图；
 * - 无红圈：发送全图；
 * - 原始文件 > 2 MB 或结果超过 1 MB：自动缩放并用 JPEG 0.8 压缩。
 *
 * 红色轨迹按用户在画布上的实际位置映射到截图像素坐标。
 */
export async function composeScreenshotWithDrawings(
  screenshot: ScreenshotAsset,
  annotations: CanvasAnnotation[],
): Promise<string> {
  const image = await loadImage(screenshot.dataUrl)
  const visual = visualAnnotations(annotations)
  const isLargeSource = screenshot.sourceBytes > LARGE_SOURCE_BYTES

  // 无红圈、原图不大且规范化结果已在上限内：直接发送全图。
  if (
    visual.length === 0 &&
    !isLargeSource &&
    screenshot.bytes <= MAX_IMAGE_BYTES
  ) {
    return screenshot.dataUrl
  }

  const display = screenshotViewportRect(screenshot)
  const fullCrop: Rect = {
    x: 0,
    y: 0,
    width: image.width,
    height: image.height,
  }
  const crop =
    (visual.length > 0 ? screenshotCropRect(screenshot, visual) : null) ??
    fullCrop
  return encodeWithLimit(image, visual, display, crop, isLargeSource)
}
