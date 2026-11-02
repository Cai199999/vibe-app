"""数据库层：SQLAlchemy 2.0 引擎、会话与 ORM 基类。

所有业务表模型统一继承 Base，禁止手拼原生 SQL。
"""

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings

settings = get_settings()

# pool_pre_ping 防止 MySQL 空闲连接被服务端断开；pool_recycle 定期回收连接。
engine = create_engine(
    settings.mysql_dsn,
    pool_pre_ping=True,
    pool_recycle=3600,
    echo=settings.debug,
    future=True,
)

SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
    expire_on_commit=False,
    class_=Session,
)


class Base(DeclarativeBase):
    """所有 ORM 模型的公共基类。"""


def get_db() -> Generator[Session, None, None]:
    """FastAPI 依赖注入：每个请求独立会话，结束后自动关闭。"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
