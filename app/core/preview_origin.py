"""预览项目 Origin 的语法与安全策略校验。

本模块只处理字符串层面的校验，不发起网络请求：
- 只接受 http / https；
- Host 必须是合法域名、IPv4 或 IPv6；
- 拒绝用户名 / 密码、路径、查询串与片段；
- 拒绝 Docker、MySQL、Redis、MinIO 等基础设施 / 管理端口。

是否允许非回环地址由 ``ALLOW_REMOTE_PROJECTS`` 控制，默认关闭。
"""

from __future__ import annotations

import ipaddress
import re
from urllib.parse import urlsplit

# 与前端 canvas-ui/src/lib/project.ts 的 BLOCKED_PREVIEW_PORTS 保持一致。
BLOCKED_PREVIEW_PORTS = frozenset(
    {
        22,  # SSH
        2375,  # Docker daemon
        2376,  # Docker daemon TLS
        3306,  # MySQL
        5432,  # PostgreSQL
        5672,  # RabbitMQ
        6379,  # Redis
        8000,  # Vibe FastAPI
        9000,  # MinIO API
        9001,  # MinIO Console
        9200,  # Elasticsearch
        11211,  # Memcached
        15672,  # RabbitMQ Management
        27017,  # MongoDB
    }
)

_HOST_LABEL = re.compile(
    r"^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$",
    re.IGNORECASE,
)


class PreviewOriginError(ValueError):
    """预览项目地址不合法，或未通过远程加载策略。"""


def _canonical_hostname(host: str) -> str | None:
    """把 Host 规范化为小写 ASCII；非法时返回 None。"""
    # FQDN 允许末尾带点（如 localhost.），规范化时统一去掉。
    host = host.rstrip(".")
    if not host or len(host) > 253:
        return None
    if any(ch.isspace() or ord(ch) < 32 or ord(ch) == 127 for ch in host):
        return None

    # IPv4 / IPv6 字面量优先，避免把 ::1 当成非法域名。
    try:
        return ipaddress.ip_address(host).compressed
    except ValueError:
        pass

    try:
        ascii_host = host.encode("idna").decode("ascii").lower()
    except UnicodeError:
        return None
    if len(ascii_host) > 253:
        return None

    labels = ascii_host.split(".")
    if any(not _HOST_LABEL.fullmatch(label) for label in labels):
        return None
    # 纯数字顶级域不是合法域名；这类地址通常是写错的 IPv4。
    if labels[-1].isdigit():
        return None
    return ascii_host


def is_local_hostname(host: str) -> bool:
    """是否为回环地址：127.0.0.0/8、::1、localhost、*.localhost。"""
    canonical = _canonical_hostname(host)
    if canonical is None:
        return False
    try:
        if ipaddress.ip_address(canonical).is_loopback:
            return True
    except ValueError:
        pass
    return canonical == "localhost" or canonical.endswith(".localhost")


def normalize_preview_origin(value: str) -> str:
    """校验并规范化 previewOrigin，只保留 scheme + host + 非默认端口。"""
    raw = value.strip()
    if not raw:
        raise PreviewOriginError("previewOrigin 不能为空。")

    parsed = urlsplit(raw)
    scheme = parsed.scheme.lower()
    if scheme not in {"http", "https"}:
        raise PreviewOriginError("previewOrigin 必须是 http:// 或 https:// 地址。")
    if parsed.username is not None or parsed.password is not None:
        raise PreviewOriginError("previewOrigin 不能包含用户名或密码。")
    if parsed.query or parsed.fragment:
        raise PreviewOriginError("previewOrigin 不能包含查询串或片段。")
    if parsed.path not in {"", "/"}:
        raise PreviewOriginError("previewOrigin 只能是 Origin，不能包含路径。")

    host = _canonical_hostname(parsed.hostname or "")
    if host is None:
        raise PreviewOriginError("previewOrigin 的 Host 格式不正确。")

    try:
        port = parsed.port
    except ValueError as exc:
        raise PreviewOriginError("previewOrigin 的端口格式不正确。") from exc
    if port is not None and not 1 <= port <= 65535:
        raise PreviewOriginError("previewOrigin 的端口必须在 1-65535 之间。")

    default_port = 80 if scheme == "http" else 443
    host_part = f"[{host}]" if ":" in host else host
    if port is None or port == default_port:
        return f"{scheme}://{host_part}"
    return f"{scheme}://{host_part}:{port}"


def ensure_preview_origin_allowed(
    value: str,
    *,
    allow_remote: bool,
) -> str:
    """在语法校验之后执行端口与远程开关策略。"""
    origin = normalize_preview_origin(value)
    parsed = urlsplit(origin)
    host = parsed.hostname or ""
    port = parsed.port
    if port is None:
        port = 443 if parsed.scheme == "https" else 80

    if port in BLOCKED_PREVIEW_PORTS:
        raise PreviewOriginError(
            f"不允许加载基础设施或管理端口 {port}，请填写 Vite dev server 地址。"
        )

    if not allow_remote and not is_local_hostname(host):
        raise PreviewOriginError(
            "远程项目加载已关闭。请在根目录 .env 设置 "
            "ALLOW_REMOTE_PROJECTS=true 并重启 FastAPI。"
        )
    return origin
