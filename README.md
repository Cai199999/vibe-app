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
