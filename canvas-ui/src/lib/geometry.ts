import type { Point, Rect, Viewport } from '../types/vibe'

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function round(value: number, digits = 2): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

export function roundPoint(point: Point): Point {
  return { x: round(point.x), y: round(point.y) }
}

export function roundRect(rect: Rect): Rect {
  return {
    x: round(rect.x),
    y: round(rect.y),
    width: round(rect.width),
    height: round(rect.height),
  }
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function bboxOf(points: Point[]): Rect {
  if (points.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 }
  }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  points.forEach((point) => {
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x)
    maxY = Math.max(maxY, point.y)
  })

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  }
}

export function expandRect(rect: Rect, padding: number): Rect {
  return {
    x: rect.x - padding,
    y: rect.y - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  }
}

export function intersects(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  )
}

export function offsetRect(rect: Rect, dx: number, dy: number): Rect {
  return { ...rect, x: rect.x + dx, y: rect.y + dy }
}

export function centerOfRect(rect: Rect): Point {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
}

/**
 * 等距抽样，保留首尾点，最多 max 个。
 * 原始点仍保留在画布本地，只有提交 L3 时才降采样。
 */
export function downsamplePoints(points: Point[], max = 100): Point[] {
  if (points.length <= max) {
    return points.map(roundPoint)
  }
  if (max <= 1) {
    return [roundPoint(points[0])]
  }

  const result: Point[] = []
  const step = (points.length - 1) / (max - 1)
  for (let index = 0; index < max; index += 1) {
    result.push(roundPoint(points[Math.round(index * step)]))
  }
  return result
}

/** 生成确定性的空间摘要，不调用模型。 */
export function describeRect(rect: Rect): string {
  return `位置 (${Math.round(rect.x)}, ${Math.round(rect.y)})，尺寸 ${Math.round(
    rect.width,
  )}×${Math.round(rect.height)}`
}

export function axisOf(delta: Point): 'x' | 'y' | 'both' {
  const absX = Math.abs(delta.x)
  const absY = Math.abs(delta.y)
  if (absX < 2 && absY >= 2) return 'y'
  if (absY < 2 && absX >= 2) return 'x'
  return 'both'
}

export function screenToWorld(
  clientX: number,
  clientY: number,
  canvasRect: DOMRect,
  viewport: Viewport,
): Point {
  return {
    x: (clientX - canvasRect.left - viewport.pan.x) / viewport.zoom,
    y: (clientY - canvasRect.top - viewport.pan.y) / viewport.zoom,
  }
}

export function worldToScreen(
  point: Point,
  canvasRect: DOMRect,
  viewport: Viewport,
): Point {
  return {
    x: canvasRect.left + viewport.pan.x + point.x * viewport.zoom,
    y: canvasRect.top + viewport.pan.y + point.y * viewport.zoom,
  }
}
