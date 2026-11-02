# vibe-app

FastAPI + SQLAlchemy + MySQL/Redis/MinIO 的全栈应用骨架。

## 快速开始

```bash
cd ~/Workspace/vibe-app
source .venv/bin/activate

# 首次运行需安装依赖
pip install -r requirements.txt

# 启动开发服务
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

- 健康检查：<http://127.0.0.1:8000/health>
- 接口文档：<http://127.0.0.1:8000/docs>

## 配置

```bash
cp .env.example .env   # 按需修改连接串与密钥
```

中间件复用 `~/Workspace/infra` 下常驻的 Docker 实例，无需重复部署。

画布默认只允许加载本机 Vite 项目。需要加载局域网 / 远程项目时，在根目录 `.env` 设置
`ALLOW_REMOTE_PROJECTS=true` 并重启 FastAPI；仅支持 Vite + React，危险端口始终拦截。
详见 [`canvas-ui/README.md`](canvas-ui/README.md#远程项目加载可选)。

## 测试与格式化

```bash
pytest
black .
```

## 阶段二交互原型

单文件可交互原型，用于评审“画布 + 旁注 + 圈画 + 拖拽”的核心交互：

```bash
cd ~/Workspace/vibe-app
python3 -m http.server 8080
# 打开 http://127.0.0.1:8080/docs/prototypes/stage-2-canvas.html
```

原型仅模拟 Agent 流程，不调用 DeepSeek、不写业务代码。说明与限制见
[`docs/prototypes/README.md`](docs/prototypes/README.md)。

## 阶段三设计

- [功能模块梳理](docs/design/01.功能模块梳理.md)
- [整体架构设计](docs/design/02.整体架构设计.md)
- [API 接口设计](docs/design/03.API接口设计.md)

设计文档为待审核草案；接口契约确认前不开始业务编码。


## 真实预览画布（阶段五）

```bash
# 1) 后端
source .venv/bin/activate
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

# 2) 示例 Vite 项目（已接入 @vibe/vite-plugin）
cd examples/vite-demo
npm install
npm run dev
# http://127.0.0.1:5173

# 3) 画布
cd ../../canvas-ui
npm install
npm run dev
# http://127.0.0.1:5174，在中央输入 http://127.0.0.1:5173
```

核心接入方式：用户项目启用 `vibe()` 插件后，画布只需 iframe 加载 URL；
插件自动注入 SDK 与 `data-source`，SDK 通过 `postMessage` 同步组件名、行号、JSX 片段。
无需手动导入 HTML。详见 [`canvas-ui/README.md`](canvas-ui/README.md) 与
[`vibe-plugin/README.md`](vibe-plugin/README.md)。

画布操作：滚轮上滑缩小/下滑放大；按住中键拖拽平移；右侧工作台可折叠。
