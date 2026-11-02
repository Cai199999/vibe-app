/** 仅视觉模式下复用的用户提示，保证界面与测试文案一致。 */

export const VISUAL_NO_SOURCE_MESSAGE =
  '当前页面不支持源码解析，请直接使用画笔标注。'

export const VISUAL_REQUIRE_SCREENSHOT_MESSAGE =
  '请先上传截图或使用源码模式。'

export const VISUAL_SCREENSHOT_READY_MESSAGE =
  '截图已加载，可在截图上圈画；点击生成会合成红笔轨迹并调用视觉模型。'

export const VISUAL_IMAGE_INVALID_MESSAGE =
  '仅支持 PNG / JPEG / WebP 截图，且合成后需小于 1 MB。'

export const VISUAL_MODE_STATUS_MESSAGE =
  '3 秒内未检测到 Vibe SDK，已切换为仅视觉模式。'

/** 视觉模式常驻隐私提示：图片内容无法由后端正则脱敏。 */
export const VISUAL_PRIVACY_WARNING =
  '🔒 提示：请确保截图中不包含明文密码、Token 等敏感信息，云端模型无法为您对图片内容脱敏。'
