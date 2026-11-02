# 阶段六：项目部署与交付（2026-11-02）

## 目标

把 Vibe Canvas MVP 整理为可本地一键运行、可打包分发、可开源分享的状态。

## 交付内容

| 项目 | 结果 |
|---|---|
| 全局 README | 重写 `README.md`：一句话介绍、Mermaid 架构图、快速开始、核心功能、模型与隐私、目录结构、验证命令、已知边界 |
| 插件目录 | `vibe-plugin/` 重命名为 `vite-plugin-vibe/`，仓库内引用同步更新 |
| 插件包名 | `@vibe/vite-plugin@0.1.0`；`main` / `module` / `exports` 指向 `dist/index.js` |
| 插件构建 | `scripts/build.mjs` 输出 `dist/index.js` + `dist/sdk.js`；`prepare` 自动构建 |
| 一键启动 | 新增 `scripts/dev.sh`，同时启动 FastAPI `127.0.0.1:8000` 与 Canvas `127.0.0.1:5174`，Ctrl+C 清理两个独立进程组 |
| 示例项目 | `examples/vite-demo` 通过 `file:../../vite-plugin-vibe` 使用新 dist 结构 |

## 验证记录

```text
.venv/bin/pytest -q                        112 passed
canvas-ui npm run build                    通过（299 modules）
canvas-ui npm run lint                     exit 0
node --check vite-plugin-vibe/src/*.js     通过
vite-plugin-vibe npm run build             dist/index.js + dist/sdk.js
vite-plugin-vibe npm pack --dry-run        4 files / 10.6 kB
demo /__vibe/health                        status=ok, version=0.1.0
demo /@vibe/sdk.js                         PAGE_FOCUS 存在
demo /src/App.jsx                          data-source 137 处
scripts/dev.sh 启动                        两端口均 200
scripts/dev.sh SIGINT                      退出码 130，8000/5174 均释放
```

## 安全约束

- `.env`、`.venv/`、`node_modules/`、`dist/`、`*.log`、`*.db` 均被 `.gitignore` 排除。
- 测试全程使用 mock provider，未调用真实付费 DeepSeek API。
- 复用宿主机 Docker MySQL / Redis / MinIO；未新增 Dockerfile 或 docker-compose。
- 最终提交与 tag 仅保留在本地，不执行 `git push`。

## 已知边界

- 插件仅支持 Vite + React；生产构建不注入任何内容。
- 跨域 iframe 无法直接截图，视觉模式依赖用户上传或粘贴。
- 第三方组件内部节点、动态 DOM 可能没有 `data-source`。
- HMR 后源码行号可能变化，Prompt 中的片段以生成时为准。
