import { useCallback, useEffect, useRef, useState } from 'react'

import type { ToastTone } from './useToast'
import { normalizeScreenshot } from '../lib/screenshot'
import {
  VISUAL_IMAGE_INVALID_MESSAGE,
  VISUAL_SCREENSHOT_READY_MESSAGE,
} from '../lib/messages'
import type { ScreenshotAsset } from '../types/vibe'

/**
 * 仅视觉模式的截图状态。
 *
 * 跨域 iframe 不能静默截屏，因此只接受用户主动上传或 Ctrl/Cmd+V 粘贴。
 * 截图只存在于浏览器内存，切换项目 / 退出视觉模式时立即清空。
 */
export function useScreenshot(
  active: boolean,
  showToast: (message: string, tone?: ToastTone) => void,
) {
  const [screenshot, setScreenshot] = useState<ScreenshotAsset | null>(null)
  const [loading, setLoading] = useState(false)
  const activeRef = useRef(active)
  const loadSeqRef = useRef(0)

  // 模式切换时由 App 显式 clear；同步 ref，阻止已失效的异步读取写入状态。
  useEffect(() => {
    activeRef.current = active
  }, [active])

  const loadFile = useCallback(
    async (file: File) => {
      if (!activeRef.current) return
      const seq = ++loadSeqRef.current
      setLoading(true)
      try {
        const next = await normalizeScreenshot(file)
        if (seq !== loadSeqRef.current || !activeRef.current) return
        setScreenshot(next)
        showToast(VISUAL_SCREENSHOT_READY_MESSAGE, 'success')
      } catch (error) {
        if (seq !== loadSeqRef.current) return
        const message =
          error instanceof Error
            ? error.message
            : VISUAL_IMAGE_INVALID_MESSAGE
        showToast(message, 'error')
      } finally {
        if (seq === loadSeqRef.current) setLoading(false)
      }
    },
    [showToast],
  )

  const clear = useCallback(() => {
    loadSeqRef.current += 1
    setScreenshot(null)
    setLoading(false)
  }, [])

  // 监听整页粘贴。只拦截带图片的剪贴板，不影响输入框中的普通文本。
  useEffect(() => {
    if (!active) return

    const onPaste = (event: ClipboardEvent) => {
      const items = Array.from(event.clipboardData?.items ?? [])
      const imageItem = items.find((item) =>
        item.type.startsWith('image/'),
      )
      if (!imageItem) return
      const file = imageItem.getAsFile()
      if (!file) return
      event.preventDefault()
      void loadFile(file)
    }

    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [active, loadFile])

  return {
    screenshot,
    loading,
    loadFile,
    clear,
  }
}
