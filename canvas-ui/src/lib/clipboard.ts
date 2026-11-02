/**
 * 复制纯文本到系统剪贴板。
 *
 * 优先使用异步 Clipboard API；部分浏览器在非安全上下文或权限被拒绝时
 * 会让 writeText 直接抛错，此时退回 textarea + execCommand 兼容路径。
 */
export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch {
      // 继续尝试同步兼容路径。
    }
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()

  try {
    if (!document.execCommand('copy')) {
      throw new Error('浏览器未授予剪贴板权限')
    }
  } finally {
    document.body.removeChild(textarea)
  }
}
