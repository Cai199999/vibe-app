# 2026-11-02 · 阶段六：源码模式自动探测与仅视觉降级

## 本次完成

- `useIframeBridge` 增加 3 秒源码模式探测窗口：
  - 必须同时收到 SDK `HELLO` 与首个有效 `SNAPSHOT`，才进入 `connected`（源码模式）；
  - 超时、无 SDK、协议主版本不兼容、心跳失败时进入 `visual`（仅视觉模式）；
  - 降级在本次项目加载内保持，迟到的握手不再切回源码模式；重新加载项目可重新探测。
- 状态与 UI：
  - 绿色「已连接源码模式 · N 节点」；
  - 黄色「仅视觉模式」，画布右上角显示降级原因；
  - PreviewFrame 标题栏显示 `snapshot rN` / `visual only` / `probing SDK`。
- 仅视觉模式能力：
  - 旁注/拖拽点击元素提示「当前页面不支持源码解析，请直接使用画笔标注。」；
  - 圈画仍可用，创建本地 `visual-draw` 标注（无 target / snippet / JSX）；
  - 「生成指令」在 App 与 RightPanel 双重拦截，提示「未检测到源码插件，无法生成精准 Prompt。请使用本地的 Vite 项目，或等待视觉多模态能力接入。」；
  - `buildPromptRequest` 对 `visual-draw` 保留运行时硬拦截，确保不会调用 L3。
- 新增 `src/lib/messages.ts` 统一降级文案；`src/types/vibe.ts` 增加 `VisualDrawAnnotation` 与 `SourceAnnotation`。

## 验证结果（Firefox headless + geckodriver）

源码模式（`examples/vite-demo`，`127.0.0.1:5173`）：

- 3 秒内显示「已连接源码模式 · 81 节点」，指示灯为绿色；
- 旁注命中 `src/App.jsx:35:7`，生成 510 字符 Markdown，包含目标与 JSX 片段；
- 中键平移、滚轮缩放、工作台折叠均正常。

仅视觉模式（`python3 -m http.server 5180`，普通 HTML，无插件）：

- 0.6 秒显示「探测中」，3.8 秒显示「仅视觉模式」，指示灯为琥珀色；
- 降级横幅提示 3 秒内未检测到 Vibe SDK；
- 旁注点击提示使用画笔；
- 圈画保存 1 条「视觉圈画」标注，卡片显示「无源码」，不显示 `src/`；
- 点击生成提示未检测到源码插件，未调用 `/api/v1/prompts/generate`；
- 截图：`/tmp/vibe-visual-mode.png`。

## 已知边界

- 协议仍由项目内 SDK 主动发送 `HELLO`，画布侧负责探测超时与状态机；未改变已有 L1 消息方向。
- 降级后不自动恢复源码模式，避免迟到快照导致界面在两种模式间跳变；修复插件后重新加载项目即可。
- 仅视觉标注只存在于当前页面内存，刷新或切换项目即清空。
