# Vibe Canvas · 前端画布

`vibe-app` 的可视化标注前端：通过 iframe 加载用户正在运行的 Vite 项目，在真实页面上做旁注、圈画、拖拽，把空间操作整理成符合 `docs/design/03.API接口设计.md` 的请求，调用本地 FastAPI 生成 Markdown Prompt。

画布本身不修改用户代码、不生成 Diff、不控制 dev server，也不强制刷新页面。

## 组成

| 目录 | 作用 |
|---|---|
| `canvas-ui/` | 画布、标注、右侧 Prompt 工作台、L3 调用 |
| `vibe-plugin/` | Vite dev 插件 + 浏览器 SDK：注入 `data-source`、握手、快照、命中、片段 |
| `examples/vite-demo/` | 可直接运行的 Vite + React 验证项目 |

## 快速启动

### 1. 启动后端（项目根目录）

```bash
cd ~/Workspace/vibe-app
source .venv/bin/activate
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

确认：

```bash
curl http://127.0.0.1:8000/api/v1/health
```

### 2. 启动一个接入了插件的前端项目

可以使用仓库自带示例：

```bash
cd ~/Workspace/vibe-app/examples/vite-demo
npm install
npm run dev
# http://127.0.0.1:5173
```

也可以接入自己的项目：

```bash
cd ~/Workspace/your-app
npm install -D file:/home/admin1/Workspace/vibe-app/vibe-plugin
```

```js
// vite.config.js
import react from '@vitejs/plugin-react'
import vibe from '@vibe/vite-plugin'

export default defineConfig({
  plugins: [vibe(), react()],
})
```

### 3. 启动画布

```bash
cd ~/Workspace/vibe-app/canvas-ui
npm install
npm run dev
# http://127.0.0.1:5174
```

打开画布 → 在中央「加载本地项目」输入 `http://127.0.0.1:5173` → 加载项目。

3 秒内完成 `HELLO` + `SNAPSHOT` 握手时，右上角显示绿色「已连接源码模式 · N 节点」，标题栏显示 `snapshot rN`；否则自动降级为黄色「仅视觉模式」。

## Agent 连接原理（无需导入 HTML）

这是本系统的关键接入方式：

1. 用户项目启动时，`@vibe/vite-plugin` 在 dev 编译期为每个第一方 JSX 元素注入
   `data-source="相对路径:行号:列号"`、`data-source-kind`、`data-component`。
2. 插件同时把 `/@vibe/sdk.js` 自动注入 `index.html`。用户**不需要手动导入任何 HTML 文件，也不需要手写 script 标签**。
3. 画布只做一件事：用 iframe 加载用户输入的 URL，并在 URL 上附加
   `__vibe_host=<画布 Origin>`，用于让 SDK 精确校验父窗口。
4. SDK 向父窗口发送 `HELLO`；画布校验 `event.source`、`event.origin`、协议主版本后回
   `WELCOME`（session token + host origin）。
5. SDK 随后发送 `SNAPSHOT`：只包含带 `data-source` 的可见节点、组件名、标签、文本、布局、邻居与矩形。
6. 旁注/拖拽通过 `HIT_TEST` 拿最近的目标；圈画通过 `ELEMENTS_IN_BOX` 取框内元素；提交前通过
   `SOURCE_SNIPPET_REQUEST` 取编译期片段注册表中的 JSX。
7. 画布把 iframe 视口坐标转换为 world 坐标，随标注一起提交给 L3 服务。跨域页面 DOM 始终不直接读取。

所有 `postMessage` 都使用精确 Origin，绝不使用 `"*"`；没有 `data-source` 或 JSX 片段时，前端与后端都会硬阻断。

## 自动探测与降级

加载新项目时，`useIframeBridge` 进入 3 秒探测窗口：

| 结果 | 顶部状态 | 可用能力 |
|---|---|---|
| 3 秒内收到 SDK `HELLO` 且解析到首个有效 `SNAPSHOT` | 绿色「已连接源码模式」 | 旁注 / 圈画 / 拖拽 / 生成结构化 Prompt |
| 超时、无 SDK、协议不兼容、跨域页面无法握手、心跳断线 | 黄色「仅视觉模式」 | 浏览页面、抓手/缩放、上传截图、圈画、生成视觉 Prompt |

仅视觉模式的行为：

- 跨域 iframe 无法静默截屏，必须由用户**上传截图**（工具栏按钮）或直接 `Ctrl/Cmd + V` 粘贴；
- 截图只存在于浏览器内存，最长边压缩到 1600 px、合成后 ≤ 1 MB；
- 圈画生成 `visual-draw` 本地标注，不带 `data-source` / JSX；截图作为底图显示在画布上，可在其上继续圈画；
- 点击「生成指令」时，前端用离屏 Canvas 把**原截图 + 红色手绘轨迹**合成为 PNG，随 `image_base64` 一起提交；
- 没有截图时前端硬阻断并提示「请先上传截图或使用源码模式。」，不会调用 L3；
- 降级后本次项目加载保持仅视觉模式，不因迟到消息反复跳变；重新加载项目可重新探测。

实现位置：`src/hooks/useIframeBridge.ts`、`src/hooks/useScreenshot.ts`、`src/lib/screenshot.ts`、`src/lib/messages.ts`；视觉标注类型见 `src/types/vibe.ts`。

## 画布操作

| 操作 | 方式 |
|---|---|
| 缩放 | **滚轮：上滑缩小，下滑放大**；左下角 +/- 也可 |
| 平移 | **按住鼠标中键拖拽**；空格 + 拖动；抓手模式 |
| 工作区 | 背景点阵与画布父容器固定，仅 artboard 内容平移/缩放 |
| 收起工作台 | 点击右侧工作台左边缘的折叠把手；再次点击展开 |
| 旁注 / 圈画 / 拖拽 | `N` / `P` / `D` |
| 交互 / 抓手 | `V` / `H` |
| 撤销标注 | `Ctrl` / `⌘` + `Z` |
| 取消当前操作 | `Esc` |
| 保存浮层 | `Ctrl` / `⌘` + `Enter` |
| 上传截图（仅视觉模式） | 顶部「上传截图」按钮，支持 PNG / JPEG / WebP |
| 粘贴截图（仅视觉模式） | 聚焦画布后 `Ctrl` / `⌘` + `V` |

> 交互模式（`V`）下，鼠标事件由真实页面接管：浏览器不会把 iframe 内的滚轮/中键事件冒泡给父窗口。
> 因此在 iframe 正上方缩放或平移时，请先切到抓手/旁注/圈画/拖拽模式，或使用空格 + 拖动。
> 在画布背景、标题栏、标注覆盖层与 iframe 外部，中键拖拽始终可用。

## 环境变量

复制 `.env.example` 为 `.env`（`.env` 不入库）：

```env
VITE_PROMPT_API_BASE=http://127.0.0.1:8000
```

| 变量 | 说明 |
|---|---|
| `VITE_PROMPT_API_BASE` | L3 Prompt 服务地址；默认 `127.0.0.1:8000` |

预览项目地址不再写死，也不再有 `VITE_PREVIEW_ORIGIN`。iframe 的 Origin 在用户点击「加载项目」时动态解析；只接受本机回环地址（`localhost` / `127.0.0.1` / `::1`），与后端校验保持一致。

后端 CORS 默认放行：

- `http://127.0.0.1:5174`
- `http://localhost:5174`

修改画布端口时，同步修改根目录 `.env` 的 `ALLOWED_ORIGINS` 并重启后端。

## 使用流程

1. 加载本地项目，等待 3 秒探测结果：
   - 「已连接源码模式」：继续结构化标注；
   - 「仅视觉模式」：先上传 / 粘贴截图，再圈画；
2. 源码模式下选择旁注 / 圈画 / 拖拽，在真实页面上做标注；仅视觉模式在截图上圈画；
3. 在浮层确认修改意图；
4. 点击右侧「生成指令」：源码模式提交结构化标注；视觉模式先合成红笔截图，再提交 `image_base64`；
5. 检查 Markdown、目标文件、警告、字符数，复制到 Cursor / Claude Code。

## 目录结构

```text
canvas-ui/
├── src/
│   ├── api/
│   │   ├── promptApi.ts         # L3 fetch 客户端、错误归一化
│   │   └── promptPayload.ts     # 画布标注 → API DTO（动态项目 Origin）
│   ├── components/
│   │   ├── canvas/              # 画布、真实 iframe、截图层、项目加载、浮层、标注
│   │   ├── panel/               # 可折叠工作台、标注列表、Markdown 结果
│   │   ├── ui/                  # Icon、Toast
│   │   └── TopBar.tsx
│   ├── hooks/
│   │   ├── useIframeBridge.ts   # 动态 Origin、握手、请求队列、心跳、项目切换重置
│   │   ├── useCanvasViewport.ts # 平移 / 缩放 / 自适应
│   │   ├── useAnnotations.ts
│   │   ├── usePromptGeneration.ts
│   │   ├── useScreenshot.ts     # 上传 / 粘贴 / 压缩 / 生命周期清理
│   │   └── useToast.ts
│   ├── lib/
│   │   ├── constants.ts         # 协议版本、画布尺寸、限制
│   │   ├── project.ts           # 地址解析、lastProjectUrl、__vibe_host
│   │   ├── geometry.ts          # 坐标换算、bbox、降采样
│   │   ├── ids.ts               # 内存态会话 / 请求 ID
│   │   ├── messages.ts          # 仅视觉模式统一提示文案
│   │   ├── screenshot.ts        # 截图归一化、显示矩形、红笔轨迹合成
│   │   └── targets.ts           # iframe-viewport → world 坐标
│   ├── types/vibe.ts            # L1 / L3 共享类型
│   ├── App.tsx
│   └── index.css
└── vite.config.ts               # 127.0.0.1:5174，strictPort
```

`vibe-plugin/` 与 `examples/vite-demo/` 在仓库根目录；详见 `vibe-plugin/README.md`。

## 数据与安全约束

- 标注只保存在当前页面内存；刷新即清空。切换项目时自动清空，避免 `data-source` 混用。
- 手绘本地最多 5000 点，提交前等距降采样到 ≤100 个关键点。
- 源码标注必须绑定 `data-source` 与 JSX 片段；缺失时前端阻断。
- 仅视觉模式只允许创建 `visual-draw` 标注，不包含源码目标；必须存在截图才允许生成。
- 截图与合成图只在内存中处理；不写入 `localStorage`、不自动上传、不自动截屏。
- 合成图以 `image_base64` 顶层字段提交；服务端不落盘、不写日志。
- 请求头携带内存态 `X-Vibe-Session`，并与请求体 `requestId` 绑定。
- 画布切换项目会轮换 session token，并拒绝旧项目在途请求。
- Prompt 只渲染 Markdown；不渲染原始 HTML、远程图片，链接只允许 `http(s)` / 锚点 / 站内路径。
- 真实 `.env` 不入库；前端日志不打印标注正文或 Prompt 内容。
- SDK 仅在 dev server 注入，生产构建不包含 `data-source`、片段注册表或 SDK。

## 验证

```bash
# 前端类型检查 + 生产构建
npm run build

# Oxlint
npm run lint

# 插件 + 示例
cd ../vibe-plugin && npm install
cd ../examples/vite-demo && npm install && npm run build

# 后端测试
cd ../..
.venv/bin/python -m pytest -q
```

本地联调检查清单：

- [x] 加载真实 Vite 项目，iframe 跨域握手成功；
- [x] 快照节点数 > 0，组件名 / `data-source` / 源码行号可见；
- [x] 滚轮上滑缩小、下滑放大；
- [x] 中键拖拽平移，位移与鼠标一致；
- [x] 平移/缩放时背景点阵与工作区尺寸不变；
- [x] 右侧工作台可收起/展开，画布宽度随之变化；
- [x] 真实点击生成旁注，读取插件片段，经 CORS 生成 Markdown；
- [x] 无插件页面 3 秒后自动进入「仅视觉模式」，点击元素提示使用画笔；
- [x] 仅视觉模式上传 / 粘贴截图后显示缩略图与截图层；
- [x] 在截图上圈画后生成指令，请求体携带 `image_base64` 合成图与 `visual-draw` 标注；
- [x] 合成图红笔轨迹与画布位置一致；
- [x] 无截图时生成被前端阻断并提示上传；
- [x] `npm run build` / `npm run lint` 通过。

> 复制按钮调用 `navigator.clipboard`（降级到 `execCommand`）；部分浏览器需要用户授权或在安全上下文中使用，请在目标浏览器中手动确认一次。

## 常见问题

**3 秒后变为「仅视觉模式」**

- 项目没有启用 `vibe()`，或插件不在 `react()` 之前；
- 项目不是 Vite dev server，或地址/端口错误；
- 项目文件是 `.js` / `.ts` 但含 JSX；默认只处理 `.jsx` / `.tsx`，可配置 `include`；
- 使用了 `localhost` 与 `127.0.0.1` 混写，浏览器会视为不同 Origin；
- 用户项目通过 CSP `frame-ancestors` 禁止被 iframe 嵌入；
- 页面较慢，3 秒内没有完成 `HELLO` + `SNAPSHOT`。修复后点击「更换」重新加载项目即可重新探测。

**页面能加载，但快照为 0**

- 页面没有带 `data-source` 的可见节点；
- 插件解析该文件失败（终端会打印 `[vibe] 跳过 ...`）；
- 页面用了非 JSX 的 DOM 生成方式，属于设计边界。

**生成指令报 `NETWORK_ERROR`**

- FastAPI 未启动或端口不是 8000；
- `VITE_PROMPT_API_BASE` 与后端地址不一致；
- 浏览器控制台出现 CORS 错误时，检查根目录 `.env` 的 `ALLOWED_ORIGINS`。

**生成报 `SNIPPET_REQUIRED` / `SOURCE_REQUIRED`**

- 目标没有带 `data-source`，或插件片段注册表未命中；
- 这是有意设计的硬阻断，避免生成无法定位的 Prompt。

**仅视觉模式提示「请先上传截图或使用源码模式。」**

- 仅视觉模式没有可自动截取的画面，必须点击顶部「上传截图」或直接粘贴图片；
- 上传后若提示图片无效，请确认格式为 PNG / JPEG / WebP，且合成后不超过 1 MB（前端会先压缩到最长边 1600 px）。

**视觉生成报 `MODEL_UNAVAILABLE`**

- 根目录 `.env` 中 `DEEPSEEK_API_KEY` 为空，或服务没有重启；
- 本地 Mock 模式（`PROMPT_PROVIDER=mock`）会返回 `mock-vision-v1`，只能验证合成与链路，不能真正识别截图内容。

**中键或滚轮在交互模式下没反应**

- 浏览器把 iframe 内的输入事件交给真实页面，父窗口收不到；
- 切到抓手/旁注/圈画/拖拽模式，或使用空格 + 拖动。

**端口被占用**

`vite.config.ts` 使用 `strictPort: true`，5174 被占用时会直接失败。释放端口或同步修改端口与后端白名单。示例项目占用 5173，同样使用 `strictPort`。
