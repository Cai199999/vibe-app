import { createPortal } from 'react-dom'

import type { ToastState } from '../../hooks/useToast'

const TONE_CLASSES: Record<NonNullable<ToastState['tone']>, string> = {
  info: 'border-white/10 text-slate-200',
  success: 'border-emerald-400/25 text-emerald-200',
  error: 'border-rose-400/30 text-rose-200',
}

export function Toast({ toast }: { toast: ToastState | null }) {
  if (!toast) return null

  return createPortal(
    <div
      role="status"
      className={`pointer-events-none fixed bottom-6 left-1/2 z-[90] -translate-x-1/2 rounded-full border bg-[#0c0f15]/95 px-4 py-2 text-[11px] font-medium shadow-2xl backdrop-blur ${TONE_CLASSES[toast.tone]}`}
    >
      {toast.message}
    </div>,
    document.body,
  )
}
