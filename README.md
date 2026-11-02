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

设计文档为待审核草案；未开始接口细化或业务编码。
