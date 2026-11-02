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
  - `composeScreenshotWithDrawings`：绘制原图、叠加 `#ef4444` 圆头粗线、按需裁剪/缩小后导出 PNG 或 JPEG data URL。
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

## 视觉性能优化（2026-11-02 追加）

### 自动裁剪与聚焦

- `screenshotCropRect`：把所有 `visual-draw` 的 `visual.bbox` 求并集（画布世界坐标），
  经 `screenshotViewportRect` 映射到截图像素坐标，叠加红笔线宽边距，再向四周各扩 20%，
  最后夹在 `[0, width] × [0, height]` 内。
- 有红圈时只合成并提交裁剪区域；没有红圈时提交完整截图。多个圈画合并为一个包围盒，
  避免一次请求产生多张图片。
- 绘制红笔时按裁剪区域重新映射所有点位，保证轨迹与裁剪图对齐；裁剪框太小（<2 px）时回退全图。

### 前端压缩与 1 MB 兜底

- `ScreenshotAsset` 新增 `sourceBytes`，记录用户原始文件大小。
- 原图 > 2 MB：合成时直接使用 JPEG 质量 0.8，并先铺白底避免透明区域变黑。
- 普通图片：先尝试 PNG；超过 1 MB 转 JPEG 0.8；仍超限则按 0.85 比例逐级缩小，
  最多 20 次，质量最低 0.5，直到 Base64 解码后 ≤ 1 MB。
- 上传阶段仍把最长边压到 1600 px 并保证归一化 PNG ≤ 1 MB；后端 1 MB 硬校验保持不变。

### 视觉 Prompt 强化

- `_VISION_SYSTEM_PROMPT` 第 10 条新增：明确要求模型告诉接收方（如 Cursor），
  这是基于视觉标注的修改需求，需结合原有框架进行样式或组件的重构。

### 浏览器 E2E 结果（fetch 拦截，不调用真实 API）

- 1600×914 截图 + 搜索框红圈：提交图为 **656×107**，PNG 12,822 B；红色像素 8,661，
  左右/下侧均保留外扩边距（上侧因搜索框贴近图片顶边被边界夹住）。
- 清空标注后：提交完整 **1600×914** 截图，PNG 47,687 B。
- 4,075,901 B 的 2200×1200 原图：归一化后经 JPEG 0.8 合成，最终 **723×395、162,705 B**，
  MIME 为 `image/jpeg`，满足 ≤ 1 MB。
- 后端 `pytest`：38 passed；前端 `npm run build` / `npm run lint` 通过。

## 真实 DeepSeek 验证

配置真实 `DEEPSEEK_API_KEY` 并重启后，直接以 `/tmp/vibe-composite.png`（Northwind 页面 +
搜索框红圈）调用 `/api/v1/prompts/generate`：

- 返回 `status=ok`、`model=deepseek-flash`、无 warnings；
- Markdown 准确识别红圈内容为顶部导航的搜索输入框，placeholder 为
  「搜索项目、客户或订单…」，左侧为品牌标识「Northwind」；
- Prompt 要求先按界面文本定位文件、不得编造路径，并给出加宽、提高边框/文字对比度、
  保持原有交互行为的具体指令。

## 已知限制

- 真实视觉识别已用 Northwind 搜索框截图验证；仍需更多页面类型做 Prompt 质量评估。
- Firefox 合成 `ClipboardEvent` 会丢弃 `clipboardData`，E2E 通过 `Object.defineProperty`
  模拟真实粘贴事件；真实 `Ctrl/Cmd+V` 仍需在目标浏览器人工确认。
- 截图只存在内存，刷新页面即丢失；不做自动截屏、不落盘、不上传对象存储。
- 多个相距很远的红圈会合并成一个大包围盒，节省 Token 的效果下降；当前不做多图拆分。
- 红圈贴近截图边缘时，20% 外扩会被图片边界夹住，这是预期行为。
- 裁剪依赖前端合成坐标，若截图与画布显示比例不一致，仍需以 `screenshotViewportRect`
  为唯一映射来源，不能另写缩放逻辑。
