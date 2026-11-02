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
  DrawAnnotation,
  DragAnnotation,
  LocalProject,
  Neighbor,
  PromptGenerateRequest,
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

function drawPayload(annotation: DrawAnnotation) {
  const points = downsamplePoints(annotation.visual.rawPoints, MAX_KEY_POINTS)
  return {
    kind: 'draw' as const,
    points,
    pointCount: points.length,
    downsampledFrom: annotation.visual.rawPoints.length,
    bbox: roundRect(annotation.visual.bbox),
    stroke: { color: '#e879f9', width: 2.4 },
    relatedSources: annotation.visual.relatedSources.slice(0, 20),
    spatialSummary: annotation.visual.spatialSummary.slice(0, 500),
  }
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
  annotation: CanvasAnnotation,
): ApiAnnotation {
  const base: ApiAnnotation = {
    annotationId: annotation.id,
    type: annotation.type,
    // 服务端要求 1–2000 字符；空意图在前端已阻止。
    intent: annotation.intent.trim().slice(0, 2000),
    createdAt: annotation.createdAt,
    target: toApiTarget(annotation.target),
    jsxSnippet: annotation.snippet,
  }

  if (annotation.type === 'draw') {
    base.visual = drawPayload(annotation)
  }
  if (annotation.type === 'drag') {
    base.drag = dragPayload(annotation)
  }
  return base
}

export function buildPromptRequest(
  annotations: CanvasAnnotation[],
  project: LocalProject,
): PromptGenerateRequest {
  if (annotations.length === 0) {
    throw new Error('至少需要一条标注才能生成 Prompt')
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
    annotations: annotations.map(toApiAnnotation),
    options: {
      outputLanguage: 'zh-CN',
      maxPromptChars: MAX_PROMPT_CHARS,
    },
  }
}
