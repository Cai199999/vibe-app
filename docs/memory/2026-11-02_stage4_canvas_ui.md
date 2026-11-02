# 2026-11-02 · 阶段四：React 画布与 L3 联调

## 本次完成

- 新建 `canvas-ui/`：Vite 8 + React 19 + TypeScript + TailwindCSS 4。
- 画布：无限平移 / 缩放 / 适应视图；空格拖拽、中键、抓手模式。
- 三种标注：
  - 旁注：`HIT_TEST` 命中 `data-source`，读取 JSX 片段，浮层填写意图；
  - 圈画：本地 ≤5000 点，`ELEMENTS_IN_BOX` 取覆盖元素，提交前降采样到 ≤100 点；
  - 拖拽：只记录位移意图，不修改 DOM。
- 坐标链路：iframe-viewport → world（y + 44pt titlebar）→ L3。
- iframe 桥接：`postMessage` 严格校验 origin / source / session / protocol major；支持 HELLO/WELCOME、SNAPSHOT、HIT_TEST、ELEMENTS_IN_BOX、SOURCE_SNIPPET_REQUEST、ERROR、PING/PONG。
- Mock 预览 `public/mock-preview.html`：12 个 `data-source` 节点、JSX 片段注册表、隐藏节点过滤、快照上限、消息协议。
- 右侧工作台：标注列表、选中 / 删除 / 清空、生成指令、错误码、警告、目标文件、字符数、Markdown 安全渲染、复制。
- CORS：前端 `127.0.0.1:5174` 已与 FastAPI 白名单对齐。

## 联调中修复

- L3 `drag.delta` 字段与 API 文档不一致：文档定义 `{dx, dy}`，后端原实现为 `{x, y}`，导致 Mock Prompt 显示 `dx=0, dy=0`。已统一为 `dx/dy`，新增渲染测试。
- Mock iframe WELCOME 握手存在 `replyTo` 竞态；改为校验父窗口 Origin + session 后接受。
- 新增标注时不再强制居中画布，避免用户刚画完视图跳动；仅从列表主动选中已有标注时聚焦。
- `useAnnotations.undo` 移除 setState updater 内的副作用。

## 验证结果

- 后端：31 个 pytest 通过；`black .` 无改动。
- 前端：`npm run build`、`npm run lint` 通过。
- 浏览器端到端（Firefox headless + geckodriver）：
  - 握手成功，TopBar 显示「已连接 · 12 节点」；
  - 旁注 / 圈画 / 拖拽各保存一条；
  - 点击生成后经 CORS POST 到 `/api/v1/prompts/generate`；
  - 返回 1,714 字符 Markdown，包含目标文件、JSX 片段、拖拽 `dx=120.0, dy=50.0`；
  - 截图确认布局与 Prompt 渲染正常。

## 待办

- 真实 Vite 插件、`data-source` 注入、SDK 自动注入。
- 真实 DeepSeek Provider 联调与 Prompt 质量评估。
- `localStorage` 历史、HMR 后标注重定位 / 失效标记。
- 手动截图上传（1 MB）与图片压缩。
