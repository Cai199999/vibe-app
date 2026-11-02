import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'

import { fetchCapabilities } from '../../api/systemApi'
import {
  getLastProjectUrl,
  isRemoteProjectAddress,
  parseProjectUrl,
  rememberProjectUrl,
} from '../../lib/project'
import type { LocalProject } from '../../types/vibe'
import { Icon } from '../ui/Icon'

interface LandingPageProps {
  onEnterSource: (project: LocalProject) => void
  onEnterVisual: () => void
}

type RemotePolicy =
  | { status: 'loading' }
  | { status: 'ready'; allowed: boolean }
  | { status: 'error' }

const DEFAULT_URL = 'http://localhost:5173'

const REMOTE_WARNING =
  '请只加载你信任的项目地址。远程页面会把 DOM 数据与源码片段发送给模型。'

/** 进入画布前的模式选择页：源码模式或仅视觉模式。 */
export function LandingPage({
  onEnterSource,
  onEnterVisual,
}: LandingPageProps) {
  const [selected, setSelected] = useState<'source' | null>(null)
  const [value, setValue] = useState(() => getLastProjectUrl() || DEFAULT_URL)
  const [error, setError] = useState<string | null>(null)
  const [remotePolicy, setRemotePolicy] = useState<RemotePolicy>({
    status: 'loading',
  })

  // 远程开关仍以 FastAPI 能力声明为唯一来源。
  useEffect(() => {
    let cancelled = false
    void fetchCapabilities()
      .then((capabilities) => {
        if (cancelled) return
        setRemotePolicy({
          status: 'ready',
          allowed: capabilities.features.allowRemoteProjects === true,
        })
      })
      .catch(() => {
        if (!cancelled) setRemotePolicy({ status: 'error' })
      })
    return () => {
      cancelled = true
    }
  }, [])

  const allowRemoteProjects =
    remotePolicy.status === 'ready' ? remotePolicy.allowed : null
  const showRemoteWarning =
    remotePolicy.status === 'ready' &&
    remotePolicy.allowed &&
    isRemoteProjectAddress(value)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    try {
      const project = parseProjectUrl(value, { allowRemoteProjects })
      rememberProjectUrl(project.url)
      setError(null)
      onEnterSource(project)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '地址格式不正确。')
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#080a0f] px-6 py-12 text-slate-200 antialiased">
      <div className="pointer-events-none absolute left-1/2 top-[18%] h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-indigo-500/[0.07] blur-[120px]" />

      <div className="relative w-full max-w-[720px]">
        <div className="mb-10 flex flex-col items-center text-center">
          <div className="logo-mark h-11 w-11 rounded-xl">
            <Icon name="sparkles" size={19} />
          </div>
          <h1 className="mt-4 text-[22px] font-semibold tracking-tight text-white">
            Vibe Canvas
          </h1>
          <p className="mt-1.5 text-[11px] text-slate-500">
            把界面意图变成可执行的 Prompt
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            data-testid="source-mode-entry"
            onClick={() => setSelected('source')}
            aria-expanded={selected === 'source'}
            className={`group flex min-h-[126px] flex-col items-start rounded-2xl border p-5 text-left transition ${
              selected === 'source'
                ? 'border-indigo-400/40 bg-indigo-400/[0.06] shadow-[0_0_0_1px_rgba(129,140,248,0.12)]'
                : 'border-white/[0.08] bg-white/[0.025] hover:border-white/[0.16] hover:bg-white/[0.04]'
            }`}
          >
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-400/10 text-indigo-300">
              <Icon name="code" size={16} />
            </span>
            <span className="mt-4 flex w-full items-center gap-2">
              <span className="text-[13px] font-semibold text-slate-100">
                加载本地项目
              </span>
              <Icon
                name="chevronRight"
                size={12}
                className="ml-auto text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-slate-400"
              />
            </span>
            <span className="mt-1 text-[10px] text-slate-500">
              Vite + React · 源码模式
            </span>
          </button>

          <button
            type="button"
            data-testid="visual-mode-entry"
            onClick={onEnterVisual}
            className="group flex min-h-[126px] flex-col items-start rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5 text-left transition hover:border-amber-400/25 hover:bg-amber-400/[0.03]"
          >
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-400/10 text-amber-300">
              <Icon name="image" size={16} />
            </span>
            <span className="mt-4 flex w-full items-center gap-2">
              <span className="text-[13px] font-semibold text-slate-100">
                使用截图
              </span>
              <Icon
                name="chevronRight"
                size={12}
                className="ml-auto text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-slate-400"
              />
            </span>
            <span className="mt-1 text-[10px] text-slate-500">
              无需插件 · 仅视觉模式
            </span>
          </button>
        </div>

        {selected === 'source' && (
          <form
            onSubmit={handleSubmit}
            className="mt-3 rounded-2xl border border-white/[0.08] bg-[#0d1017]/90 p-3 backdrop-blur"
          >
            <div className="flex items-center gap-2">
              <label htmlFor="project-url" className="sr-only">
                项目地址
              </label>
              <input
                id="project-url"
                data-testid="project-url"
                value={value}
                onChange={(event) => {
                  setValue(event.target.value)
                  if (error) setError(null)
                }}
                autoFocus
                spellCheck={false}
                autoComplete="off"
                placeholder={DEFAULT_URL}
                className="h-10 min-w-0 flex-1 rounded-lg border border-white/[0.1] bg-black/25 px-3 font-mono text-[11px] text-slate-200 outline-none transition placeholder:text-slate-700 focus:border-indigo-400/50 focus:ring-2 focus:ring-indigo-400/15"
              />
              {showRemoteWarning && (
                <span
                  data-testid="remote-project-warning"
                  title={REMOTE_WARNING}
                  aria-label={REMOTE_WARNING}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-amber-300/80"
                >
                  <Icon name="alert" size={13} />
                </span>
              )}
              <button
                type="submit"
                data-testid="load-project"
                className="btn-primary flex h-10 shrink-0 items-center gap-1.5 rounded-lg px-4 text-[11px] font-semibold"
              >
                进入
                <Icon name="chevronRight" size={12} />
              </button>
            </div>
            {error && (
              <p
                data-testid="project-url-error"
                className="mt-2 flex items-start gap-1.5 px-0.5 text-[10px] leading-relaxed text-rose-300"
              >
                <Icon name="alert" size={11} className="mt-0.5 shrink-0" />
                {error}
              </p>
            )}
          </form>
        )}

        <p className="mt-8 text-center text-[9px] text-slate-600">
          本地会话 · 截图不落盘 · Prompt 不包含 Diff
        </p>
      </div>
    </div>
  )
}
