import { useEffect, useRef, useState } from 'react'
import Markdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { PROMPT_API_BASE } from '../../lib/constants'
import type { PromptResponse } from '../../types/vibe'
import type { PromptErrorState } from '../../hooks/usePromptGeneration'
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

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  const ok = document.execCommand('copy')
  document.body.removeChild(textarea)
  if (!ok) throw new Error('浏览器未授予剪贴板权限')
}

function formatTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date)
}

function EmptyPrompt() {
  return (
    <div className="flex h-full flex-col justify-center px-5 pb-16">
      <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-4">
        <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-200">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-indigo-400/10 text-indigo-300">
            <Icon name="sparkles" size={14} />
          </span>
          生成可粘贴的 Markdown 指令
        </div>
        <p className="mt-2.5 text-[10px] leading-relaxed text-slate-500">
          画布只负责把空间意图转成结构化 Prompt。生成后复制到 Cursor 或 Claude
          Code 执行；本系统不会修改代码、生成 Diff 或控制 dev server。
        </p>
        <ol className="mt-3 space-y-1.5 text-[10px] text-slate-500">
          {[
            '在预览上完成至少一条标注',
            '点击「生成指令」调用本地 FastAPI',
            '检查 Markdown，然后复制使用',
          ].map((step, index) => (
            <li key={step} className="flex items-center gap-2">
              <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-white/[0.06] font-mono text-[8px] text-slate-400">
                {index + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      </div>
      <div className="mt-3 flex items-center gap-1.5 rounded-lg border border-white/[0.05] px-2.5 py-1.5 font-mono text-[8px] text-slate-600">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/70" />
        POST {PROMPT_API_BASE}/api/v1/prompts/generate
      </div>
    </div>
  )
}

function LoadingPrompt() {
  return (
    <div className="space-y-3 px-1 pt-2" aria-live="polite">
      <div className="flex items-center gap-2 text-[10px] text-indigo-300">
        <span className="h-3 w-3 animate-spin rounded-full border border-indigo-300/30 border-t-indigo-300" />
        正在组装 Prompt · 校验硬约束与脱敏…
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
      <p className="text-[9px] leading-relaxed text-slate-600">
        Mock Provider 不调用外部模型；真实 DeepSeek 仅在
        PROMPT_PROVIDER=deepseek 时启用。
      </p>
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
        <p className="mt-3 text-[9px] leading-relaxed text-slate-600">
          若错误为 NETWORK_ERROR，请确认 FastAPI 已在 127.0.0.1:8000
          启动，且 VITE_PROMPT_API_BASE 指向同一地址。
        </p>
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

      <div className="shrink-0 flex items-center justify-between gap-2 px-1 pt-2 text-[8px] text-slate-600">
        <span className="truncate font-mono">{response.requestId}</span>
        <span className="shrink-0">{formatTime(response.createdAt)}</span>
      </div>
    </div>
  )
}
