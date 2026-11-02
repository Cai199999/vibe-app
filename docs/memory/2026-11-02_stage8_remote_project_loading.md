# 阶段八：远程 Vite 项目加载开关（2026-11-02）

## 目标与决策

原实现只允许加载回环地址。本阶段增加受控的远程加载能力：

- 根目录 `.env` 新增 `ALLOW_REMOTE_PROJECTS`，默认 `false`；
- 开关开启后允许任意合法 `http(s)` Host，但仍拦截基础设施 / 管理端口；
- 当前只支持 **Vite + React + `@vibe/vite-plugin`**，不为 Vue / Svelte 扩展 AST 解析；
- 前端在输入非本机地址时显示红字安全警告；
- 前端与后端使用同一套策略，后端在生成时再次校验。

## 实现

### 后端

- `app/config.py`：新增 `allow_remote_projects: bool = False`。
- `app/core/preview_origin.py`（新增）：
  - 只接受 http / https Origin，拒绝路径、查询串、片段、用户名 / 密码；
  - Host 支持域名、IPv4、IPv6，统一小写并去掉 FQDN 末尾点；
  - 默认仅回环地址：`localhost`、`*.localhost`、`127.0.0.0/8`、`::1`；
  - 始终拦截危险端口：
    `22 / 2375 / 2376 / 3306 / 5432 / 5672 / 6379 / 8000 / 9000 / 9001 / 9200 / 11211 / 15672 / 27017`。
- `app/schemas/prompt.py`：`previewOrigin` 只做语法与 Origin 形态校验，去掉硬编码回环限制。
- `app/services/prompt_service.py`：调用模型前按 `allow_remote_projects` 执行策略校验，
  失败返回 `400 VALIDATION_FAILED`。
- `/api/v1/capabilities`：`features.allowRemoteProjects` 暴露开关，供前端读取。

### 前端

- `canvas-ui/src/api/systemApi.ts`（新增）：读取 `/api/v1/capabilities`，远程开关以后端为唯一来源。
- `canvas-ui/src/lib/project.ts`：
  - 移除 `localHosts` 硬编码；
  - `parseProjectUrl(raw, { allowRemoteProjects })` 按开关决定是否允许远程 Host；
  - 始终拒绝凭据、非法 Host、危险端口；
  - 新增 `isRemoteProjectAddress` 用于安全警告。
- `canvas-ui/src/components/canvas/ProjectLauncher.tsx`：
  - 标题改为「加载 Vite 项目」，明确仅支持 Vite + React + `@vibe/vite-plugin`；
  - 显示「远程项目加载：已开启 / 已关闭 / 读取失败」；
  - 开关开启且输入非本机地址时显示：
    「⚠️ 请仅加载你信任的项目地址，远程页面会将 DOM 数据与源码片段发送给模型。」
  - 能力接口失败时提供「重试」，本地项目仍可加载。

## 配置

根目录 `.env`：

```env
ALLOW_REMOTE_PROJECTS=false   # 默认，仅本机
# ALLOW_REMOTE_PROJECTS=true  # 允许局域网 / 远程 Vite + React 项目
```

修改后必须重启 FastAPI；画布启动页会重新读取能力声明，必要时刷新页面。
前端不使用 `VITE_ALLOW_REMOTE_PROJECTS`，避免前后端配置不一致。

## 局域网 / 远程项目测试步骤

1. 目标项目已接入插件，并监听可访问网卡：

   ```bash
   npm run dev -- --host 0.0.0.0 --port 5173
   ```

2. 根目录 `.env` 设置 `ALLOW_REMOTE_PROJECTS=true`，重启 FastAPI。
3. 刷新画布，确认启动页显示「远程项目加载：已开启」。
4. 输入 `http://<目标机器IP>:5173`，确认出现红字警告，点击「加载项目」。
5. 3 秒内 SDK 握手成功则进入源码模式；否则进入仅视觉模式。
6. 若失败，依次检查：
   - 目标页面是否设置 `X-Frame-Options` / CSP `frame-ancestors`；
   - 画布与项目是否被 HTTPS / HTTP 混合内容策略拦截；
   - 目标端口是否在危险端口名单内；
   - 画布 Origin 是否在 `ALLOWED_ORIGINS` 中（画布跨机器访问时）。

## 测试结果

- 后端：`pytest` **74 项通过**，新增覆盖：
  - 开关关闭时远程 Origin 被拒，错误信息提示 `ALLOW_REMOTE_PROJECTS`；
  - 开关开启时远程 Origin 可生成；
  - 危险端口即使开关开启仍被拒；
  - 用户名密码、非法 Host、路径、非 http(s) 协议被拒；
  - `/capabilities` 正确暴露开关状态。
- 前端：`npm run build` / `npm run lint` 通过。
- 浏览器 E2E（真实后端默认关闭 + 拦截 capabilities 模拟开启）：
  - 默认显示「已关闭」，远程地址提交被阻断；
  - 本机 `http://127.0.0.1:5180` 仍可进入仅视觉模式；
  - 模拟开启后显示「已开启」，非本机地址出现指定红字警告；
  - `3306` 端口、带用户名密码、非法 Host 均被拦截；
  - 远程地址通过校验后可进入 iframe 加载流程。

## 已知限制

- 仅支持 Vite + React；Vue / Svelte 需要扩展插件注入与片段解析。
- 远程页面必须允许被 iframe 嵌入，且需处理 HTTPS / HTTP 混合内容限制。
- 开关在 FastAPI 启动时读取；修改 `.env` 后必须重启服务并刷新画布。
- 危险端口名单仅为开发期防护，不等同于完整的 SSRF / 网络访问控制；
  本工具不会由后端主动访问 `previewOrigin`，但仍不应加载不可信页面。
