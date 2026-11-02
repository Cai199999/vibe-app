"""应用配置。

统一通过 pydantic-settings 从环境变量 / .env 读取配置，
避免在代码中硬编码数据库口令、密钥等敏感信息。
"""

from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# 项目根目录（app/config.py 的上两级）
BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    """全局配置项，字段名与环境变量名大小写不敏感地一一对应。"""

    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",  # 忽略 .env 中未声明的变量，便于平滑扩展
        populate_by_name=True,  # 兼容测试中 Settings(prompt_provider=...) 的写法
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

    # ---- Prompt 服务 ----
    # 统一模型提供方：mock / deepseek / ollama。
    # 优先读取 LLM_PROVIDER；旧变量 PROMPT_PROVIDER 作为兼容别名。
    llm_provider: str = Field(
        default="mock",
        validation_alias=AliasChoices("LLM_PROVIDER", "PROMPT_PROVIDER"),
    )
    # 发送给模型前是否脱敏（邮箱 / 手机号 / AK/SK / Token 等），默认开启。
    redact_sensitive: bool = True
    # 默认只允许 localhost / 127.0.0.1 / ::1；开启后允许任意合法 http(s) 主机。
    allow_remote_projects: bool = False
    allowed_origins: str = "http://127.0.0.1:5174,http://localhost:5174"

    # ---- DeepSeek（OpenAI 兼容接口） ----
    deepseek_api_key: str = ""
    deepseek_base_url: str = "https://api.deepseek.com"
    deepseek_model: str = "deepseek-chat"
    # 截图 / 红笔轨迹合成图走多模态模型；文本路径继续使用 DEEPSEEK_MODEL。
    deepseek_vision_model: str = "deepseek-flash"
    deepseek_timeout_seconds: float = 30.0
    deepseek_max_tokens: int = 2000
    deepseek_temperature: float = 0.2

    # ---- Ollama（本地 / 局域网，OpenAI 兼容接口） ----
    # 直连示例：http://127.0.0.1:11434 或 http://192.168.1.20:11434
    ollama_base_url: str = "http://127.0.0.1:11434"
    ollama_model: str = "qwen2.5:7b"
    # 留空表示不支持截图；配置视觉模型后自动启用多模态路径。
    ollama_vision_model: str = ""
    ollama_timeout_seconds: float = 120.0
    ollama_max_tokens: int = 2000
    ollama_temperature: float = 0.2
    # 本地小模型上下文有限，JSX 片段超过该字符数时截断并加提示。
    ollama_max_snippet_chars: int = 2000
    # 直连 Ollama 通常为空；经反向代理 / 网关时按需填写。
    ollama_api_key: str = ""

    # ---- 接口上限（与 03.API接口设计.md 对齐） ----
    max_snapshot_elements: int = 200
    max_text_length: int = 200
    max_neighbors: int = 6
    max_snippet_lines: int = 40
    max_snippet_bytes: int = 4096
    max_image_bytes: int = 1024 * 1024
    max_image_edge: int = 1600
    max_points_per_stroke: int = 100
    max_recorded_points_per_stroke: int = 5000
    max_annotations_per_request: int = 50
    max_request_body_bytes: int = 8 * 1024 * 1024
    max_prompt_chars: int = 20000

    @property
    def allowed_origin_list(self) -> list[str]:
        """把逗号分隔的 origin 配置解析为列表，并去掉空项。"""
        return [
            origin.strip()
            for origin in self.allowed_origins.split(",")
            if origin.strip()
        ]


@lru_cache
def get_settings() -> Settings:
    """进程内单例，避免重复解析 .env。"""
    return Settings()
