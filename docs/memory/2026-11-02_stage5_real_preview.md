# 2026-11-02 · 阶段五：画布体验优化与真实项目接入

## 本次完成

### 1. 画布交互

- 滚轮方向反转：**上滑缩小、下滑放大**；以鼠标位置为缩放中心。
- 平移：**按住鼠标中键拖拽**；保留空格 + 拖动、抓手模式。
- 工作区锁定：点阵背景与画布父容器固定，仅 artboard 的 `transform` 变化；移除随 pan/zoom 变化的 `backgroundSize/Position`。
- 右侧 Prompt 工作台增加贴边折叠把手，收起后画布自动占满剩余宽度；收起状态仍保留展开入口。
- 中键触发时阻止浏览器自动滚动/辅助点击。

### 2. 真实项目接入

- 删除写死的 `public/mock-preview.html`。
- 新增「加载本地项目」输入框（画布中央空态），支持本机 `localhost` / `127.0.0.1` / `::1` 地址。
- iframe `src` 与 `postMessage` Origin 在运行时动态解析，不再使用 `VITE_PREVIEW_ORIGIN`。
- 加载后 URL 追加 `__vibe_host=<画布 Origin>`，SDK 只接受该父窗口的 WELCOME。
- 切换项目时：清空标注、重置 Prompt、轮换 session token、拒绝在途请求、清空快照。
- L3 请求中的 `project.previewOrigin` 使用当前项目 Origin，而不是静态常量。

### 3. 补齐仓库中缺失的 Vite 插件与 SDK

检查后发现仓库此前只有设计文档与 Mock，并不存在可用的 Vite 插件 / SDK。本次新增：

- `vibe-plugin/`：dev-only Vite 插件
  - Babel 解析 `.jsx/.tsx`，给每个 JSXOpeningElement 注入
    `data-source="相对路径:行:列"`、`data-source-kind`、`data-component`；
  - 生成并维护 JSX 片段注册表；
  - 提供 `/__vibe/snippets`、`/@vibe/sdk.js`、`/__vibe/health`；
  - 只在 `serve` 生效，生产构建不注入。
- 浏览器 SDK：
  - HELLO/WELCOME 握手、session 校验、协议主版本校验；
  - SNAPSHOT（过滤隐藏节点、200 节点上限、布局/邻居/文本）；
  - HIT_TEST、ELEMENTS_IN_BOX、SOURCE_SNIPPET_REQUEST、PING/PONG；
  - MutationObserver 在 HMR/DOM 变化后补发快照。
- `examples/vite-demo/`：可运行的 Vite 8 + React 19 验证项目，演示真实插件接入。

### 4. Agent 连接原理（文档约定）

用户无需手动导入 HTML。用户项目启用 `@vibe/vite-plugin` 后：

1. 插件在编译期为 JSX 注入 `data-source`（含组件名与源码行号）并自动注入 SDK；
2. 画布只需 iframe 加载项目 URL；
3. SDK 自动 HELLO，画布 WELCOME 下发 session；
4. SDK 自动同步 SNAPSHOT；
5. 命中/圈画/片段请求均通过严格 Origin 的 `postMessage` 完成。

跨域 DOM 始终不直接读取。生产包不包含 SDK、`data-source` 或片段注册表。

## 验证结果（Firefox headless + geckodriver）

- 加载 `http://127.0.0.1:5173` 后：`已连接 · 81 节点`；
- iframe 内真实注入 81 个 `data-source` 节点；
- 滚轮上滑：zoom `0.863 → 0.794`；下滑：`→ 0.858`；
- 背景下沉位置与工作区尺寸在缩放前后完全一致；
- 中键拖拽 `(+120, +60)`，artboard 位移精确为 `(120, 60)`；
- 工作台宽度 `420 → 0`，画布宽度 `1180 → 1600`，可恢复；
- 真实点击统计卡生成 1 条旁注，命中 `src/App.jsx:35:7`；
- 经 CORS 调用 L3，返回 443 字符 Markdown（含目标文件与 JSX 片段）；
- 截图：`/tmp/vibe-real-ux.png`。

## 已知边界

- 交互模式（真实页面点击）下，浏览器把 iframe 内的滚轮/中键事件交给 iframe，父窗口无法拦截；需切到抓手/旁注等模式后再缩放/平移。
- 插件默认只处理 `.jsx/.tsx`；`.js` 中写 JSX 需通过 `include` 放宽并自行确认语法可解析。
- 组件若吞掉未知 props，`data-source` 可能不落 DOM；由组件内部根宿主锚点兜底或阻断。
- HMR 后行号可能变化，Prompt 应要求 Agent 先读目标文件。

## 待办

- 真实 DeepSeek Provider 联调与 Prompt 质量评估。
- `localStorage` 标注历史、HMR 后标注失效标记。
- 手动截图上传（1 MB）与图片压缩。
- 将 `vibe-plugin` 发布到私有 npm 或接入 monorepo workspace。
