# 阶段七：仅视觉模式截图与多模态 Prompt（2026-11-02）

## 目标

跨域 iframe 无法静默截屏，视觉模型也无法理解裸坐标。因此仅视觉模式改为：

1. 用户手动上传或粘贴网页截图；
2. 截图作为画布底图，用户在其上继续红色圈画；
3. 生成时前端用离屏 Canvas 合成「原截图 + 红笔轨迹」PNG；
4. 顶层 `image_base64` 与标注文字一起提交；后端切换到 `deepseek-flash` 多模态模型。

## 前端改动

- `canvas-ui/src/lib/screenshot.ts`
  - 截图读取、最长边 1600 px 压缩、≤1 MB PNG 归一化。
  - `screenshotViewportRect` 与截图层、Canvas 合成共用同一 `object-contain` 显示矩形，避免坐标漂移。
  - `composeScreenshotWithDrawings`：绘制原图、叠加 `#ef4444` 圆头粗线、按需缩小后导出 PNG data URL。
- `canvas-ui/src/hooks/useScreenshot.ts`
  - 上传、粘贴（仅拦截图片剪贴板）、加载状态、切换项目 / 退出视觉模式时清空。
- `canvas-ui/src/components/canvas/ScreenshotLayer.tsx`
  - 在 iframe 上方渲染截图底图，仅视觉模式 + 有截图时出现。
- `canvas-ui/src/components/TopBar.tsx`
  - 「上传截图」、缩略图、移除按钮；隐藏 file input。
- `canvas-ui/src/App.tsx`
  - 视觉生成前先合成图片；无截图时提示「请先上传截图或使用源码模式。」并阻止请求。
- `canvas-ui/src/api/promptPayload.ts`
  - 允许 `visual-draw` + 顶层 `image_base64`；仍硬阻断视觉标注无图、以及无标注且无图。
- 源码模式校验完全不变：`target.source` 与 JSX 片段缺失仍然阻断。

## 后端改动

- `PromptGenerateRequest.image_base64`：可选顶层字段，校验 MIME / base64 / 解码后 ≤1 MB。
- `Annotation.type` 新增 `visual-draw`：
  - 必须提供 `visual`，不允许 `target`、`jsxSnippet`、`drag`；
  - 缺少顶层图片时返回 `SOURCE_REQUIRED`。
- `build_prompt_context`：图片放入内部 `imageDataUrl`，文本 JSON 中剔除，避免重复传输大 Base64。
- `DeepSeekPromptGenerator`：
  - 无 Key → `502 MODEL_UNAVAILABLE`；
  - 有图 → `DEEPSEEK_VISION_MODEL`（默认 `deepseek-flash`），消息含 `image_url` + 文本；
  - 无图 → 原 `DEEPSEEK_MODEL` 文本路径；
  - 视觉系统提示词明确「红色手绘轨迹是重点区域」，并要求结合旁注生成修改指令。
- `MockPromptGenerator`：有图返回 `mock-vision-v1`，用于本地验证合成与路由，不真正识图。
- `/api/v1/capabilities`：`imageInput=true`、`visualOnlyAnnotations=true`，新增 `model.visionModel`。

## 测试

- 后端 `pytest`：视觉 + 图片 → 200 且返回视觉 Markdown；视觉无图 → `SOURCE_REQUIRED`；
  仅图片请求 → 200；非法 data URL → 400；DeepSeek 请求体使用 `deepseek-flash` 且含红色提示词。
- 前端 `npm run build` / `npm run lint` 通过。
- 浏览器 E2E（WebDriver + 本地 Mock）：
  - 加载无 SDK 页面，3 秒后进入仅视觉模式；
  - 上传真实浏览器截图，出现缩略图与截图层；
  - 在搜索框上画红圈，生成请求含 `visual-draw` 与 `image_base64`；
  - 合成图红色像素 8661，原图 0，证明红笔轨迹已叠加；
  - 粘贴图片可替换当前截图。

## 已知限制

- 本地 `.env` 的 `DEEPSEEK_API_KEY` 为空，**尚未验证真实 `deepseek-flash` 的识图准确率**；
  Mock 路径只能验证前端合成、字段路由与 UI 展示。
- Firefox 合成 `ClipboardEvent` 会丢弃 `clipboardData`，E2E 通过 `Object.defineProperty`
  模拟真实粘贴事件；真实 `Ctrl/Cmd+V` 仍需在目标浏览器人工确认。
- 截图只存在内存，刷新页面即丢失；不做自动截屏、不落盘、不上传对象存储。
