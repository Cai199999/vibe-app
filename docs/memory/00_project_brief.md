# vibe-app 项目简报

## 项目名称与目标

- **名称**：vibe-app
- **创建日期**：2026-11-02
- **目标**：搭建一个可快速迭代的全栈应用骨架，先跑通「FastAPI 后端 + 已有 Docker 中间件」的开发闭环，再按业务逐步扩展。

## 核心技术栈

| 层 | 技术 |
|---|---|
| 后端 | Python 3.14 + FastAPI + Uvicorn |
| ORM | SQLAlchemy 2.0 + PyMySQL |
| 数据库 | MySQL 8.0（Docker，`127.0.0.1:3306/geo_ai_db`） |
| 缓存 | Redis 7.0（Docker，`127.0.0.1:6379`） |
| 对象存储 | MinIO（Docker，`127.0.0.1:9000`，控制台 9001） |
| 配置 | pydantic-settings + `.env` |
| 测试 / 格式化 | pytest + httpx + black |

> 中间件全部复用 `~/Workspace/infra` 中的常驻 Docker 实例，本项目不再自带 `docker-compose.yml`。

## 预期核心功能模块（待确认）

1. **用户与鉴权**：注册 / 登录 / JWT。
2. **业务主模块**：待补充具体领域模型与 CRUD。
3. **文件服务**：MinIO 上传、下载与临时签名 URL。
4. **缓存**：Redis 用作会话、限流与热点数据缓存。
5. **AI 能力（可选）**：接入 DeepSeek API，需配置 `DEEPSEEK_API_KEY`。

## 当前进度

- [x] 项目目录、独立 `.venv`、Git 仓库初始化
- [x] FastAPI 骨架与 `/health` 存活探针
- [x] `.env` / `.env.example` / `.gitignore`
- [x] pytest 冒烟测试
- [ ] 领域模型与数据库迁移（Alembic）
- [ ] 用户鉴权模块
- [ ] MinIO / Redis 健康检查与业务接入

## 约定

- 敏感信息只写入 `.env`，`.env.example` 保持占位符。
- 业务表必须通过 SQLAlchemy ORM 定义，禁止手拼原生 SQL。
- 每次完成独立任务后运行 `black .` 与 `pytest`，并提交 Git。
