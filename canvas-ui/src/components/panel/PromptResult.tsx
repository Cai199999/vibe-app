import { useEffect, useRef, useState } from 'react'
import Markdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

import type { PromptResponse } from '../../types/vibe'
import type { PromptErrorState } from '../../hooks/usePromptGeneration'
import { copyText } from '../../lib/clipboard'
import { Icon } from '../ui/Icon'

const MARKDOWN_COMPONENTS: Components = {
  a({ node, ...props }) {
    void node
    // 只允许网络链接、锚点与站内路径，挡住 javascript: 等协议。
    const href = typeof props.href === 'string' ? props.href : ''
    const safeHref = /^(https?:\/\/|#|\/)/.test(href) ? href : undefined
    return (
      <a
        {...props}
        href={safeHref}
        target="_blank"
        rel="noreferrer noopener"
      />
    )
  },
  img({ alt }) {
    // Prompt 里不应有远程图片；避免渲染造成隐式网络请求。
    return (
      <span className="md-image-placeholder">
        [图片已省略{alt ? `：${alt}` : ''}]
      </span>
    )
  },
}

function EmptyPrompt() {
  return (
    <div className="flex h-full flex-col items-center justify-center pb-16 text-center">
      <div className="grid h-10 w-10 place-items-center rounded-xl border border-indigo-400/15 bg-indigo-400/[0.06] text-indigo-300/80">
        <Icon name="sparkles" size={17} />
      </div>
      <p className="mt-3 text-[11px] text-slate-400">暂无 Prompt</p>
      <p className="mt-1 text-[9px] text-slate-600">完成标注后点击下方按钮</p>
    </div>
  )
}

function LoadingPrompt() {
  return (
    <div className="space-y-3 px-1 pt-2" aria-live="polite">
      <div className="flex items-center gap-2 text-[10px] text-indigo-300">
        <span className="h-3 w-3 animate-spin rounded-full border border-indigo-300/30 border-t-indigo-300" />
        生成中…
      </div>
      <div className="space-y-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
        {[86, 96, 72, 90, 55, 78, 64].map((width, index) => (
          <div
            key={`${width}-${index}`}
            className="h-2 animate-pulse rounded bg-white/[0.06]"
            style={{
              width: `${width}%`,
              animationDelay: `${index * 80}ms`,
            }}
          />
        ))}
      </div>
    </div>
  )
}

interface PromptResultProps {
  loading: boolean
  error: PromptErrorState | null
  response: PromptResponse | null
  onRetry: () => void
  showToast: (message: string, tone?: 'info' | 'success' | 'error') => void
}

export function PromptResult({
  loading,
  error,
  response,
  onRetry,
  showToast,
}: PromptResultProps) {
  const [copiedRequestId, setCopiedRequestId] = useState<string | null>(null)
  const timerRef = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
    },
    [],
  )

  if (loading) return <LoadingPrompt />

  if (error) {
    return (
      <div className="px-1 pt-2">
        <div className="rounded-xl border border-rose-400/25 bg-rose-500/[0.06] p-3.5">
          <div className="flex items-center gap-2 text-[11px] font-semibold text-rose-200">
            <Icon name="alert" size={14} />
            生成失败
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-rose-100/80">
            {error.message}
          </p>
          <div className="mt-2.5 flex items-center gap-2">
            <code className="rounded bg-black/25 px-1.5 py-0.5 font-mono text-[9px] text-rose-300/80">
              {error.code}
            </code>
            <button
              type="button"
              onClick={onRetry}
              className="ml-auto inline-flex items-center gap-1 rounded-md border border-rose-300/20 px-2 py-1 text-[9px] text-rose-200 transition hover:bg-rose-400/10"
            >
              <Icon name="refresh" size={10} />
              重试
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!response) return <EmptyPrompt />

  const prompt = response.prompt
  const totalTokens = response.usage?.totalTokens
  const copied = copiedRequestId === response.requestId

  const handleCopy = async () => {
    try {
      await copyText(prompt.content)
      setCopiedRequestId(response.requestId)
      showToast('Prompt 已复制到剪贴板', 'success')
      if (timerRef.current) window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(
        () => setCopiedRequestId(null),
        2200,
      )
    } catch (copyError) {
      showToast(
        copyError instanceof Error ? copyError.message : '复制失败',
        'error',
      )
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 px-1 pb-2.5">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-slate-200">
            Markdown Prompt
          </span>
          <span
            className={`rounded px-1.5 py-0.5 text-[8px] font-semibold ${
              response.status === 'ok'
                ? 'bg-emerald-400/10 text-emerald-300'
                : 'bg-amber-400/10 text-amber-300'
            }`}
          >
            {response.status === 'ok' ? 'OK' : 'PARTIAL'}
          </span>
          <button
            type="button"
            onClick={handleCopy}
            className="btn-primary ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-[9px] font-semibold"
          >
            <Icon name={copied ? 'check' : 'copy'} size={10} />
            {copied ? '已复制' : '复制'}
          </button>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[8px] text-slate-500">
          <span className="rounded bg-white/[0.04] px-1.5 py-0.5 font-mono">
            {prompt.charCount.toLocaleString()} chars
          </span>
          <span className="rounded bg-white/[0.04] px-1.5 py-0.5 font-mono">
            {response.model.provider} / {response.model.name}
          </span>
          {typeof totalTokens === 'number' && (
            <span className="rounded bg-white/[0.04] px-1.5 py-0.5 font-mono">
              {totalTokens.toLocaleString()} tokens
            </span>
          )}
          {prompt.truncated && (
            <span className="rounded bg-amber-400/10 px-1.5 py-0.5 font-mono text-amber-300">
              truncated
            </span>
          )}
        </div>

        {prompt.targetFiles.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {prompt.targetFiles.map((file) => (
              <span
                key={file}
                className="inline-flex max-w-full items-center gap-1 rounded border border-white/[0.06] bg-white/[0.03] px-1.5 py-0.5 font-mono text-[8px] text-slate-400"
              >
                <Icon name="file" size={8} className="shrink-0" />
                <span className="truncate">{file}</span>
              </span>
            ))}
          </div>
        )}

        {response.warnings.length > 0 && (
          <div className="mt-2 space-y-1">
            {response.warnings.map((warning) => (
              <div
                key={`${warning.code}-${warning.message}`}
                className="flex items-start gap-1.5 rounded-md border border-amber-400/15 bg-amber-400/[0.05] px-2 py-1.5 text-[9px] leading-relaxed text-amber-200/80"
              >
                <Icon
                  name="alert"
                  size={9}
                  className="mt-0.5 shrink-0 text-amber-300"
                />
                <span>
                  <span className="font-mono text-[8px] text-amber-300/70">
                    {warning.code}
                  </span>{' '}
                  {warning.message}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="panel-scroll min-h-0 flex-1 overflow-y-auto rounded-xl border border-white/[0.07] bg-[#0d1119]">
        <div
          data-testid="prompt-markdown"
          className="prompt-markdown px-3.5 py-3"
        >
          <Markdown
            remarkPlugins={[remarkGfm]}
            components={MARKDOWN_COMPONENTS}
          >
            {prompt.content}
          </Markdown>
        </div>
      </div>
    </div>
  )
}
