import {
  DEFAULT_CANVAS_CONFIG,
  MAX_KEY_POINTS,
  MAX_PROMPT_CHARS,
  PROTOCOL_VERSION,
} from '../lib/constants'
import { downsamplePoints, round, roundPoint, roundRect } from '../lib/geometry'
import { createRequestId } from '../lib/ids'
import type {
  ApiAnnotation,
  ApiTarget,
  CanvasAnnotation,
  DragAnnotation,
  DrawAnnotation,
  DrawVisual,
  LocalProject,
  Neighbor,
  PromptGenerateRequest,
  SourceAnnotation,
  VisualDrawAnnotation,
  WorldTarget,
} from '../types/vibe'

function toApiTarget(target: WorldTarget): ApiTarget {
  const neighbors: Neighbor[] = (target.neighbors ?? [])
    .slice(0, DEFAULT_CANVAS_CONFIG.maxNeighbors)
    .map((neighbor) => ({
      relation: neighbor.relation,
      source: neighbor.source,
      elementId: neighbor.elementId,
      tag: neighbor.tag,
      component: neighbor.component,
      text: neighbor.text?.slice(0, DEFAULT_CANVAS_CONFIG.maxTextLength),
    }))

  return {
    source: target.source,
    sourceKind: target.sourceKind,
    component: target.component,
    instance: target.instance,
    tag: target.tag,
    text: target.text?.slice(0, DEFAULT_CANVAS_CONFIG.maxTextLength),
    rect: roundRect(target.rect),
    coordinateSpace: 'world',
    layout: target.layout,
    neighbors,
    truncated: target.truncated ?? { text: false, neighbors: false },
  }
}

function visualPayload(visual: DrawVisual) {
  const points = downsamplePoints(visual.rawPoints, MAX_KEY_POINTS)
  return {
    kind: 'draw' as const,
    points,
    pointCount: points.length,
    downsampledFrom: visual.rawPoints.length,
    bbox: roundRect(visual.bbox),
    stroke: { color: '#ef4444', width: 6 },
    relatedSources: visual.relatedSources.slice(0, 20),
    spatialSummary: visual.spatialSummary.slice(0, 500),
  }
}

function drawPayload(annotation: DrawAnnotation) {
  return visualPayload(annotation.visual)
}

function dragPayload(annotation: DragAnnotation) {
  // 先统一 from/to 的精度，再用两者之差计算 delta，
  // 避免三个字段独立取整后出现超过 0.01 的校验偏差。
  const from = roundPoint(annotation.drag.from)
  const to = roundPoint(annotation.drag.to)
  return {
    kind: 'drag' as const,
    from,
    to,
    // 按 03.API接口设计.md，delta 字段为 dx / dy。
    delta: { dx: round(to.x - from.x), dy: round(to.y - from.y) },
    axis: annotation.drag.axis,
    relatedSources: annotation.drag.relatedSources.slice(0, 20),
    spatialSummary: annotation.drag.spatialSummary.slice(0, 500),
  }
}

export function toApiAnnotation(
  annotation: SourceAnnotation,
): ApiAnnotation {
  const base = {
    annotationId: annotation.id,
    type: annotation.type,
    // 服务端要求 1–2000 字符；空意图在前端已阻止。
    intent: annotation.intent.trim().slice(0, 2000),
    createdAt: annotation.createdAt,
    target: toApiTarget(annotation.target),
    jsxSnippet: annotation.snippet,
  }

  if (annotation.type === 'draw') {
    return { ...base, visual: drawPayload(annotation) }
  }
  if (annotation.type === 'drag') {
    return { ...base, drag: dragPayload(annotation) }
  }
  return base
}

export function toApiVisualAnnotation(
  annotation: VisualDrawAnnotation,
): ApiAnnotation {
  return {
    annotationId: annotation.id,
    type: 'visual-draw',
    intent: annotation.intent.trim().slice(0, 2000),
    createdAt: annotation.createdAt,
    visual: visualPayload(annotation.visual),
  }
}

export function buildPromptRequest(
  annotations: CanvasAnnotation[],
  project: LocalProject,
  imageBase64?: string,
): PromptGenerateRequest {
  const hasVisualAnnotation = annotations.some(
    (annotation) => annotation.type === 'visual-draw',
  )
  if (hasVisualAnnotation && !imageBase64) {
    // 仅视觉标注必须携带合成截图，否则模型没有任何界面证据。
    throw new Error('请先上传截图。')
  }
  if (annotations.length === 0 && !imageBase64) {
    throw new Error('至少需要一条标注或一张截图才能生成 Prompt')
  }

  return {
    requestId: createRequestId(),
    protocolVersion: PROTOCOL_VERSION,
    project: {
      name: project.name,
      framework: 'vite-react',
      previewOrigin: project.origin,
    },
    locale: 'zh-CN',
    annotations: annotations.map((annotation) =>
      annotation.type === 'visual-draw'
        ? toApiVisualAnnotation(annotation)
        : toApiAnnotation(annotation),
    ),
    options: {
      outputLanguage: 'zh-CN',
      maxPromptChars: MAX_PROMPT_CHARS,
    },
    ...(imageBase64 ? { image_base64: imageBase64 } : {}),
  }
}
