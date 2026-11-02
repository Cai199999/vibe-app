import { useCallback, useEffect, useRef, useState } from 'react'

export type ToastTone = 'info' | 'success' | 'error'

export interface ToastState {
  message: string
  tone: ToastTone
}

export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null)
  const timerRef = useRef<number | null>(null)

  const show = useCallback((message: string, tone: ToastTone = 'info') => {
    if (timerRef.current) window.clearTimeout(timerRef.current)
    setToast({ message, tone })
    timerRef.current = window.setTimeout(() => {
      setToast(null)
      timerRef.current = null
    }, 2600)
  }, [])

  useEffect(
    () => () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
    },
    [],
  )

  return { toast, show }
}
