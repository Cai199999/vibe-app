# Vibe Canvas · 前端画布

`vibe-app` 的可视化标注前端：在真实前端预览上做旁注、圈画、拖拽，把空间操作整理成符合 `docs/design/03.API接口设计.md` 的请求，调用本地 FastAPI 生成 Markdown Prompt。

当前阶段使用**本地 Mock iframe** 模拟 SDK。尚未接入真实 Vite 插件、`data-source` 注入和用户预览项目。

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

### 2. 启动前端

```bash
cd ~/Workspace/vibe-app/canvas-ui
npm install
npm run dev
```

打开 <http://127.0.0.1:5174>。

后端 CORS 默认只放行：

- `http://127.0.0.1:5174`
- `http://localhost:5174`

如果修改了前端端口，需同步修改根目录 `.env` 中的 `ALLOWED_ORIGINS` 并重启后端。

## 环境变量

复制 `.env.example` 为 `.env`（`.env` 不入库）：

```env
VITE_PROMPT_API_BASE=http://127.0.0.1:8000
VITE_PREVIEW_ORIGIN=http://127.0.0.1:5174
```

| 变量 | 说明 |
|---|---|
| `VITE_PROMPT_API_BASE` | L3 Prompt 服务地址；默认 `127.0.0.1:8000` |
| `VITE_PREVIEW_ORIGIN` | iframe 的**精确 Origin**，必须与 `postMessage` 的 `event.origin` 完全一致 |

> 当前 Mock iframe 与画布同源，因此 `VITE_PREVIEW_ORIGIN` 为 `5174`。接入真实项目（如 `http://127.0.0.1:5173`）时改为真实预览地址；不要混用 `localhost` 与 `127.0.0.1`。

## 使用流程

1. 等待右上角显示「已连接 · N 节点」。
2. 选择模式：
   - `N` 旁注：点击带 `data-source` 的元素，填写修改意图；
   - `P` 圈画：手绘圈选区域，自动取包围盒内元素；
   - `D` 拖拽：从元素上拖到目标位置，只记录位移意图；
   - `V` 交互 / `H` 抓手：预览交互与画布平移。
3. 在浮层中保存标注。
4. 点击右侧「生成指令」。
5. 检查 Markdown、目标文件、警告，然后复制到 Cursor / Claude Code。

系统不会修改代码、生成 Diff、编译或控制 dev server。

## 交互说明

| 操作 | 方式 |
|---|---|
| 平移画布 | 空格 + 拖动 / 抓手模式 / 鼠标中键 |
| 缩放画布 | `Ctrl` / `⌘` + 滚轮；左下角缩放控件 |
| 适应画布 | 左下角 fit 按钮 |
| 撤销标注 | `Ctrl` / `⌘` + `Z` |
| 取消当前操作 | `Esc` |
| 保存旁注浮层 | `Ctrl` / `⌘` + `Enter` |

## 目录结构

```text
canvas-ui/
├── public/
│   └── mock-preview.html        # Mock 预览页 + SDK 协议实现 + JSX 片段注册表
├── src/
│   ├── api/
│   │   ├── promptApi.ts         # L3 fetch 客户端、错误归一化
│   │   └── promptPayload.ts     # 画布标注 → API DTO（降采样、取整、裁剪）
│   ├── components/
│   │   ├── canvas/              # 画布、iframe、浮层、标注渲染、缩放控件
│   │   ├── panel/               # 标注列表、Prompt 结果、Markdown 渲染
│   │   ├── ui/                  # Icon、Toast
│   │   └── TopBar.tsx
│   ├── hooks/
│   │   ├── useIframeBridge.ts   # postMessage 握手、请求队列、心跳、Origin 校验
│   │   ├── useCanvasViewport.ts # 平移 / 缩放 / 自适应
│   │   ├── useAnnotations.ts
│   │   ├── usePromptGeneration.ts
│   │   └── useToast.ts
│   ├── lib/
│   │   ├── constants.ts         # 协议版本、画布尺寸、限制、环境变量
│   │   ├── geometry.ts          # 坐标换算、bbox、降采样
│   │   ├── ids.ts               # 内存态会话 / 请求 ID
│   │   └── targets.ts           # iframe-viewport → world 坐标
│   ├── types/vibe.ts            # L1 / L3 共享类型
│   ├── App.tsx
│   └── index.css
└── vite.config.ts               # 127.0.0.1:5174，strictPort
```

## Mock 与真实接入的差异

当前 `public/mock-preview.html` 已实现与真实 SDK 相同的消息形态：

- `HELLO` / `WELCOME` 握手；校验父窗口 Origin 与 session token；
- `SNAPSHOT`、`HIT_TEST`、`ELEMENTS_IN_BOX`、`SOURCE_SNIPPET_REQUEST`、`PING` / `PONG`；
- 12 个 `data-source` 节点与对应 JSX 片段；
- 过滤隐藏节点、200 节点上限、片段 40 行 / 4 KB。

后续接入真实项目时，只需让 Vite 插件注入同协议的 SDK，并把 `PreviewFrame` 的 iframe `src` 改为用户项目地址；画布、桥接、L3 请求层不需要重写。

## 数据与安全约束

- 标注只保存在当前页面内存；刷新即清空。
- 手绘本地最多 5000 点，提交前等距降采样到 ≤100 个关键点。
- 每条标注必须绑定 `data-source` 与 JSX 片段；缺失时前端阻断。
- 请求头携带内存态 `X-Vibe-Session`，并与请求体 `requestId` 绑定。
- Prompt 只渲染 Markdown；不渲染原始 HTML、远程图片，链接只允许 `http(s)` / 锚点 / 站内路径。
- 真实 `.env` 不入库；前端日志不打印标注正文或 Prompt 内容。

## 验证

```bash
# 前端类型检查 + 生产构建
npm run build

# Oxlint
npm run lint

# 后端测试（项目根目录）
cd ..
.venv/bin/python -m pytest -q
```

本地联调检查清单：

- [x] iframe 握手成功，快照节点数 > 0；
- [x] 旁注 / 圈画 / 拖拽各生成一条标注；
- [x] `POST /api/v1/prompts/generate` 跨域成功；
- [x] Markdown 渲染、目标文件、字符数、警告展示；
- [x] `npm run build` / `npm run lint` / `pytest` 通过。

> 复制按钮调用 `navigator.clipboard`（降级到 `execCommand`）；部分浏览器需要用户授权或在安全上下文中使用，请在目标浏览器中手动确认一次。

## 常见问题

**右上角一直「连接中」或「连接异常」**

- 检查 `.env` 的 `VITE_PREVIEW_ORIGIN` 是否与 iframe 实际 Origin 完全一致；
- 不要混用 `http://localhost:5174` 与 `http://127.0.0.1:5174`；
- Mock iframe 依赖 `document.referrer` 识别父窗口，若浏览器扩展/策略清空 referrer，会拒绝握手。

**生成指令报 `NETWORK_ERROR`**

- FastAPI 未启动或端口不是 8000；
- `VITE_PROMPT_API_BASE` 与后端地址不一致；
- 浏览器控制台出现 CORS 错误时，检查根目录 `.env` 的 `ALLOWED_ORIGINS`。

**生成报 `SNIPPET_REQUIRED` / `SOURCE_REQUIRED`**

- 目标没有带 `data-source`，或 Mock 片段注册表未命中；
- 这是有意设计的硬阻断，避免生成无法定位的 Prompt。

**端口被占用**

`vite.config.ts` 使用 `strictPort: true`，5174 被占用时会直接失败。释放端口或同步修改端口与后端白名单。
