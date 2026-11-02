import { useState } from 'react'
import type { FormEvent } from 'react'

import {
  getLastProjectUrl,
  parseProjectUrl,
  rememberProjectUrl,
} from '../../lib/project'
import type { LocalProject } from '../../types/vibe'
import { Icon } from '../ui/Icon'

interface ProjectLauncherProps {
  onLoad: (project: LocalProject) => void
}

const DEFAULT_URL = 'http://localhost:5173'

export function ProjectLauncher({ onLoad }: ProjectLauncherProps) {
  const [value, setValue] = useState(() => getLastProjectUrl() || DEFAULT_URL)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    try {
      const project = parseProjectUrl(value)
      rememberProjectUrl(project.url)
      setError(null)
      onLoad(project)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '地址格式不正确。')
    }
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-40 grid place-items-center px-6">
      <div className="pointer-events-auto w-full max-w-[560px] rounded-2xl border border-white/[0.1] bg-[#0d1017]/95 p-6 shadow-[0_30px_90px_-20px_rgba(0,0,0,0.9)] backdrop-blur-xl">
        <div className="flex items-start gap-3">
          <div className="logo-mark mt-0.5">
            <Icon name="code" size={16} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-[16px] font-semibold tracking-tight text-white">
                加载本地项目
              </h1>
              <span className="rounded-full border border-indigo-400/20 bg-indigo-400/[0.08] px-2 py-0.5 font-mono text-[8px] text-indigo-200">
                REAL PREVIEW
              </span>
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
              输入正在运行的 Vite 地址。画布通过 iframe 加载它，
              <span className="text-slate-400">
                无需手动导入任何 HTML 文件
              </span>
              。
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-5">
          <label
            htmlFor="project-url"
            className="mb-1.5 block text-[10px] font-medium text-slate-400"
          >
            项目地址
          </label>
          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-[11px] text-slate-600">
                ↗
              </span>
              <input
                id="project-url"
                data-testid="project-url"
                value={value}
                onChange={(event) => {
                  setValue(event.target.value)
                  if (error) setError(null)
                }}
                spellCheck={false}
                autoComplete="off"
                placeholder={DEFAULT_URL}
                className="h-10 w-full rounded-lg border border-white/[0.1] bg-black/25 pl-8 pr-3 font-mono text-[11px] text-slate-200 outline-none transition placeholder:text-slate-700 focus:border-indigo-400/50 focus:ring-2 focus:ring-indigo-400/15"
              />
            </div>
            <button
              type="submit"
              data-testid="load-project"
              className="btn-primary flex h-10 shrink-0 items-center gap-2 rounded-lg px-4 text-[11px] font-semibold"
            >
              <Icon name="cursor" size={13} />
              加载项目
            </button>
          </div>
          {error && (
            <p className="mt-2 flex items-center gap-1.5 text-[10px] text-rose-300">
              <Icon name="alert" size={11} />
              {error}
            </p>
          )}
        </form>

        <div className="mt-5 rounded-xl border border-white/[0.06] bg-white/[0.025] p-3.5">
          <div className="flex items-center gap-1.5 text-[9px] font-medium uppercase tracking-[0.12em] text-slate-500">
            <Icon name="sparkles" size={11} />
            接入前提
          </div>
          <ol className="mt-2 space-y-1.5 text-[10px] leading-relaxed text-slate-500">
            <li>
              <span className="mr-1.5 font-mono text-indigo-300/80">01</span>
              Vite dev server 正在运行（例如{' '}
              <code className="font-mono text-slate-400">localhost:5173</code>）。
            </li>
            <li>
              <span className="mr-1.5 font-mono text-indigo-300/80">02</span>
              项目的{' '}
              <code className="font-mono text-slate-400">vite.config</code>{' '}
              已启用{' '}
              <code className="font-mono text-indigo-200/80">
                @vibe/vite-plugin
              </code>
              。
            </li>
            <li>
              <span className="mr-1.5 font-mono text-indigo-300/80">03</span>
              插件注入的 SDK 会自动握手，并把组件名、源码行号同步给画布。
            </li>
          </ol>
        </div>

        <p className="mt-3 text-[9px] leading-relaxed text-slate-600">
          使用 localhost 与 127.0.0.1 时保持地址一致；两者是不同的 Origin。
        </p>
      </div>
    </div>
  )
}
