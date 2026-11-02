# 阶段十一：iframe 焦点切换与 URL 复制（2026-11-02）

## 目标

在不修改后端的前提下，补齐源码模式的两个高频操作：

- 点击真实 iframe 内部时，明确进入“浏览网页”状态，并在顶部 URL 条给出反馈；
- 点击 iframe 外任意父页面区域时，收回 DOM 焦点，恢复画布的快捷键与工具编辑状态；
- 顶部 URL 条提供复制按钮，复制当前项目地址并给出轻量 Toast。

## 跨域焦点协议

新增 SDK → 画布单向消息 `PAGE_FOCUS`：

```json
{
  "protocolVersion": "0.1",
  "type": "PAGE_FOCUS",
  "messageId": "msg_xxx",
  "timestamp": "2026-11-02T12:00:00.000Z",
  "sessionToken": "session_xxx"
}
```

- SDK 在 `document` 捕获阶段监听 `pointerdown`；
- 仅在已收到 `WELCOME`、持有 `sessionToken` 后发送；
- 只发送会话凭证与固定类型，不携带点击坐标、元素、路径或页面文本；
- 仍使用精确 `HOST_ORIGIN`，不使用 `"*"`；
- `HELLO.capabilities` 增加 `pageFocus: true`，便于后续兼容性判断；
- 画布侧继续校验 `event.source`、`event.origin`、协议主版本与 `sessionToken`。

## 焦点状态机

`useIframeBridge` 新增 `iframeFocused` 与 `releaseIframeFocus()`：

| 事件 | 状态 |
|---|---|
| 收到合法 `PAGE_FOCUS` | `iframeFocused = true` |
| 项目切换 / 重新加载 | `iframeFocused = false` |
| 握手超时、协议不兼容、心跳失败 | `iframeFocused = false` |
| 点击父页面任意位置 | `iframeFocused = false`，并 `canvas.focus()` |

父页面能收到 `pointerdown` 本身就说明点击不在跨域 iframe 内，因此无需猜测坐标：

- 画布根节点增加 `tabIndex={-1}`，以便在父页面点击后主动收回 DOM 焦点；
- `P` / `N` / `V` / `H` / `D` 与撤销快捷键继续由 window 级监听处理；
- 交互模式（`V`）下 iframe 才接管指针事件；旁注 / 圈画 / 拖拽模式仍由标注覆盖层优先处理，不受本次改动影响。

## UI 反馈

- 顶部新增项目 URL 条（`project-url-bar`），源码项目常驻显示，视觉截图工作区不显示；
- 浏览网页时 URL 条切换为绿色边框、绿色链接图标与「浏览中」标签；
- 点击父页面后恢复中性色与普通 URL 文本；
- URL 条右侧新增复制按钮（`copy-project-url`），复制 `project.url`，不包含 `__vibe_host`；
- 成功 Toast 固定为「URL 已复制」；失败时显示剪贴板权限错误；
- 抽离 `src/lib/clipboard.ts`，Prompt 复制与 URL 复制共用 Clipboard API + `execCommand` 兜底。

## 验证

```bash
node --check vite-plugin-vibe/src/sdk.js
cd canvas-ui
npm run build
npm run lint
```

- SDK Node 模拟测试：WELCOME 前不发送、WELCOME 后发送一次、携带正确 token、目标 Origin 精确、不含页面元数据；
- `tsc -b && vite build` 通过；
- `oxlint` 无警告；
- 后端代码、数据库与 API 未修改。

## 已知边界

- 仅交互模式（`V`）下点击 iframe 才可能触发 SDK 事件；旁注 / 圈画 / 拖拽模式的覆盖层会按设计拦截指针；
- 当前环境无可用浏览器自动化，未执行真实双端 iframe E2E；
- URL 条在 `xl`（≥1280px）及以上显示，窄屏仍可用模式栏与工作台，但不显示 URL 复制入口。
