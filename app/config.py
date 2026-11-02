"""应用配置。

统一通过 pydantic-settings 从环境变量 / .env 读取配置，
避免在代码中硬编码数据库口令、密钥等敏感信息。
"""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# 项目根目录（app/config.py 的上两级）
BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    """全局配置项，字段名与环境变量名大小写不敏感地一一对应。"""

    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",  # 忽略 .env 中未声明的变量，便于平滑扩展
    )

    # ---- 应用 ----
    app_name: str = "vibe-app"
    app_env: str = "development"
    debug: bool = True
    host: str = "127.0.0.1"
    port: int = 8000

    # ---- MySQL（复用宿主机 Docker 实例） ----
    mysql_dsn: str = (
        "mysql+pymysql://root:root@127.0.0.1:3306/geo_ai_db?charset=utf8mb4"
    )

    # ---- Redis ----
    redis_url: str = "redis://127.0.0.1:6379/0"

    # ---- MinIO ----
    minio_endpoint: str = "127.0.0.1:9000"
    minio_access_key: str = "admin"
    minio_secret_key: str = "admin123"
    minio_bucket: str = "vibe-app"
    minio_secure: bool = False

    # ---- AI（暂未启用，留空即可） ----
    deepseek_api_key: str = ""


@lru_cache
def get_settings() -> Settings:
    """进程内单例，避免重复解析 .env。"""
    return Settings()
