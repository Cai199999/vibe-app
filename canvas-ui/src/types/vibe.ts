/** 画布与 L1/L3 协议共享的数据结构。 */

export type Mode = 'interact' | 'hand' | 'note' | 'draw' | 'drag'
export type AnnotationType = 'note' | 'draw' | 'drag'
export type Axis = 'x' | 'y' | 'both'
export type SourceKind = 'host' | 'component-usage' | 'component-root'
export type NeighborRelation =
  | 'parent'
  | 'prevSibling'
  | 'nextSibling'
  | 'firstChild'

export interface Point {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface Viewport {
  zoom: number
  pan: Point
}

export type LayoutMap = Record<string, string>

export interface Neighbor {
  relation: NeighborRelation
  source: string
  elementId?: string
  tag?: string
  component?: string
  text?: string
}

export interface TruncatedFlags {
  text: boolean
  neighbors: boolean
}

/** SDK 返回的目标；L1 坐标固定为 iframe 视口坐标。 */
export interface BridgeTarget {
  elementId?: string
  source: string
  sourceKind: SourceKind
  component?: string
  instance: number
  tag?: string
  text?: string
  rect: Rect
  coordinateSpace: 'iframe-viewport'
  layout?: LayoutMap
  neighbors?: Neighbor[]
  truncated?: TruncatedFlags
  snippetAvailable?: boolean
  depth?: number
}

/** 进入 L3 前，由画布把 target 转换为世界坐标。 */
export interface WorldTarget extends Omit<BridgeTarget, 'coordinateSpace'> {
  coordinateSpace: 'world'
}

export interface JSXSnippet {
  source: string
  startLine: number
  endLine: number
  content: string
  truncated: boolean
  originalLineCount?: number
  contentHash?: string
}

export interface SnapshotElement extends BridgeTarget {
  depth?: number
  visible?: boolean
}

export interface VibeSnapshot {
  revision: number
  viewport: { width: number; height: number; devicePixelRatio: number }
  scroll: { x: number; y: number }
  meta: {
    elementCount: number
    truncated: boolean
    omittedCount: number
    generatedAt: string
  }
  elements: SnapshotElement[]
}

export interface BridgeError {
  code: string
  message: string
  details?: Record<string, unknown>
  retryable?: boolean
}

export interface HitResult {
  hit: boolean
  target: BridgeTarget | null
  jsxSnippet?: JSXSnippet
  error?: BridgeError
}

export interface ElementsResult {
  truncated: boolean
  elements: BridgeTarget[]
  error?: BridgeError
}

export interface SnippetResult {
  found: boolean
  jsxSnippet: JSXSnippet | null
  error?: BridgeError
}

export type BridgeStatus = 'idle' | 'connecting' | 'connected' | 'visual'

/** 当前加载到画布中的本地项目。 */
export interface LocalProject {
  /** 每次加载生成新的 id，用于强制重建 iframe 并重置桥接状态。 */
  id: string
  name: string
  /** 用户输入的完整地址（不含画布附加的握手参数）。 */
  url: string
  /** 用于 postMessage 校验的精确 Origin。 */
  origin: string
  loadedAt: string
}

export interface DrawVisual {
  rawPoints: Point[]
  bbox: Rect
  relatedSources: string[]
  relatedTargets: WorldTarget[]
  spatialSummary: string
}

export interface DragVisual {
  from: Point
  to: Point
  delta: Point
  fromRect: Rect
  toRect: Rect
  axis: Axis
  relatedSources: string[]
  spatialSummary: string
}

interface AnnotationBase {
  id: string
  intent: string
  createdAt: string
}

/** 源码模式标注：必须带 data-source 与可提交的 JSX 片段。 */
interface SourceAnnotationBase extends AnnotationBase {
  target: WorldTarget
  snippet: JSXSnippet
}

export interface NoteAnnotation extends SourceAnnotationBase {
  type: 'note'
}

export interface DrawAnnotation extends SourceAnnotationBase {
  type: 'draw'
  visual: DrawVisual
}

export interface DragAnnotation extends SourceAnnotationBase {
  type: 'drag'
  drag: DragVisual
}

/**
 * 仅视觉模式下的圈画：没有 data-source / JSX 片段，
 * 只保存在本地，用于视觉标记，不能进入 Prompt 提交。
 */
export interface VisualDrawAnnotation extends AnnotationBase {
  type: 'visual-draw'
  visual: DrawVisual
}

export type SourceAnnotation =
  | NoteAnnotation
  | DrawAnnotation
  | DragAnnotation

export type CanvasAnnotation = SourceAnnotation | VisualDrawAnnotation

/** 浮层草稿：确认意图后才转成正式标注。 */
export interface ComposerDraft {
  type: AnnotationType
  /** 仅视觉圈画没有 target / snippet。 */
  target?: WorldTarget
  snippet?: JSXSnippet
  /** true 表示本次草稿来自无源码的仅视觉模式。 */
  visualOnly?: boolean
  anchorRect: Rect
  screen: { left: number; top: number }
  visual?: DrawVisual
  drag?: DragVisual
}

/* ------------------------------------------------------------------ L3 API */

export interface ApiTarget {
  source: string
  sourceKind: SourceKind
  component?: string
  instance: number
  tag?: string
  text?: string
  rect: Rect
  coordinateSpace: 'world'
  layout?: LayoutMap
  neighbors?: Neighbor[]
  truncated?: TruncatedFlags
}

export interface ApiVisual {
  kind: 'draw'
  points: Point[]
  pointCount: number
  downsampledFrom: number
  bbox: Rect
  stroke: { color: string; width: number }
  relatedSources: string[]
  spatialSummary: string
}

export interface ApiDrag {
  kind: 'drag'
  from: Point
  to: Point
  /** L3 文档固定使用 dx / dy，和画布内部的 Point 区分。 */
  delta: { dx: number; dy: number }
  axis: Axis
  relatedSources: string[]
  spatialSummary: string
}

export interface ApiAnnotation {
  annotationId: string
  type: AnnotationType
  intent: string
  createdAt: string
  target: ApiTarget
  jsxSnippet: JSXSnippet
  visual?: ApiVisual
  drag?: ApiDrag
}

export interface GenerateOptions {
  outputLanguage: 'zh-CN' | 'en'
  maxPromptChars: number
}

export interface PromptGenerateRequest {
  requestId: string
  protocolVersion: string
  project: {
    name: string
    framework: 'vite-react'
    previewOrigin: string
  }
  locale: 'zh-CN' | 'en'
  annotations: ApiAnnotation[]
  options: GenerateOptions
}

export interface PromptContent {
  format: 'markdown'
  content: string
  targetFiles: string[]
  charCount: number
  truncated: boolean
}

export interface PromptWarning {
  code: string
  message: string
}

export interface PromptResponse {
  requestId: string
  status: 'ok' | 'partial'
  prompt: PromptContent
  model: { provider: string; name: string }
  usage: {
    promptTokens?: number | null
    completionTokens?: number | null
    totalTokens?: number | null
  } | null
  warnings: PromptWarning[]
  createdAt: string
}

export interface ApiErrorPayload {
  status: 'error'
  error: {
    code: string
    message: string
    details?: Record<string, unknown>
    retryable?: boolean
  }
  requestId?: string
}
