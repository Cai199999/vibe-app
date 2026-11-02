"""发送给大模型前的敏感信息脱敏。

设计边界：
- 只处理文本，不处理截图；图片内容无法通过正则脱敏；
- 命中内容统一替换为 ``[REDACTED]``，保持 Prompt 结构可读；
- 文件路径、``data-source``、图片 Base64 不做替换，避免破坏定位与传输；
- 规则宁可少量误伤，也要优先避免 AK/SK、Token、手机号、邮箱外发。
"""

from __future__ import annotations

import re
from collections.abc import Callable, Mapping
from typing import Any

REDACTED = "[REDACTED]"

# 多行私钥块必须在其他规则之前整体替换。
_PRIVATE_KEY = re.compile(
    r"-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----"
    r".*?"
    r"-----END (?:[A-Z0-9 ]+ )?PRIVATE KEY-----",
    re.DOTALL,
)

# Authorization: Bearer xxx / Basic xxx / Token xxx
_AUTH_HEADER = re.compile(
    r"(?i)\b(Authorization\s*:\s*)(Bearer|Basic|Token)\s+[A-Za-z0-9._~+/=-]{6,}"
)

# api_key=xxx、secret_key: "xxx"、password: xxx 等键值对。
_SECRET_ASSIGNMENT = re.compile(
    r"(?i)"
    r"(?P<prefix>\b(?:api[_-]?key|secret[_-]?key|access[_-]?key(?:[_-]?id)?|"
    r"client[_-]?secret|secret|password|passwd|pwd|token|auth[_-]?token|"
    r"access[_-]?token|refresh[_-]?token|id[_-]?token|private[_-]?key)\b"
    r"\s*[:=]\s*)"
    r"(?P<quote>['\"]?)"
    r"(?P<value>"
    r"(?!\[REDACTED\])"
    r"(?:(?:Bearer|Basic|Token)\s+[A-Za-z0-9._~+/=-]{6,}"
    r"|[^\s'\"`,;:}{；，、：。！？]{4,})"
    r")"
    r"(?P=quote)"
)

# 常见云厂商 / SaaS 固定前缀 Token。
_JWT = re.compile(
    r"(?<![A-Za-z0-9_-])"
    r"eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}"
    r"(?![A-Za-z0-9_-])"
)
_OPENAI_KEY = re.compile(
    r"(?<![A-Za-z0-9_-])sk-(?:ant-)?[A-Za-z0-9_-]{16,}(?![A-Za-z0-9_-])"
)
_AWS_ACCESS_KEY = re.compile(
    r"(?<![A-Za-z0-9])(?:AKIA|ASIA)[0-9A-Z]{16}(?![A-Za-z0-9])"
)
_GITHUB_TOKEN = re.compile(
    r"(?<![A-Za-z0-9_])"
    r"(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})"
    r"(?![A-Za-z0-9_])"
)
_SLACK_TOKEN = re.compile(
    r"(?<![A-Za-z0-9-])xox[baprs]-[A-Za-z0-9-]{10,}(?![A-Za-z0-9-])"
)
_GOOGLE_API_KEY = re.compile(
    r"(?<![A-Za-z0-9_-])AIza[0-9A-Za-z_-]{35}(?![A-Za-z0-9_-])"
)

_EMAIL = re.compile(
    r"(?<![A-Za-z0-9._%+-])"
    r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"
    r"(?![A-Za-z0-9.-])"
)

# 中国大陆手机号，支持 +86 / 空格 / 短横线分隔。
_CN_MOBILE = re.compile(r"(?<!\d)(?:\+?86[-\s]?)?1[3-9]\d(?:[-\s]?\d{4}){2}(?!\d)")

# 兜底：32-128 位、同时含字母与数字的长串（JWT、哈希、随机 Token 等）。
_LONG_TOKEN = re.compile(
    r"(?<![A-Za-z0-9_-])"
    r"(?=[A-Za-z0-9_-]*[0-9])"
    r"(?=[A-Za-z0-9_-]*[A-Za-z])"
    r"[A-Za-z0-9_-]{32,128}"
    r"(?![A-Za-z0-9_-])"
)

# 值可以是字符串或 re.Match -> str 的替换函数。
_Replacement = str | Callable[[re.Match[str]], str]


def _replace_auth(match: re.Match[str]) -> str:
    """保留 Authorization 类型，只替换凭据本身。"""
    return f"{match.group(1)}{match.group(2)} {REDACTED}"


def _replace_assignment(match: re.Match[str]) -> str:
    """保留键名与引号，只替换值，便于模型理解被脱敏的字段。"""
    quote = match.group("quote")
    return f"{match.group('prefix')}{quote}{REDACTED}{quote}"


# 顺序重要：先处理私钥块、请求头与键值对，再处理独立 Token / 联系方式。
_RULES: tuple[tuple[re.Pattern[str], _Replacement], ...] = (
    (_PRIVATE_KEY, REDACTED),
    (_AUTH_HEADER, _replace_auth),
    (_SECRET_ASSIGNMENT, _replace_assignment),
    (_JWT, REDACTED),
    (_OPENAI_KEY, REDACTED),
    (_AWS_ACCESS_KEY, REDACTED),
    (_GITHUB_TOKEN, REDACTED),
    (_SLACK_TOKEN, REDACTED),
    (_GOOGLE_API_KEY, REDACTED),
    (_EMAIL, REDACTED),
    (_CN_MOBILE, REDACTED),
    (_LONG_TOKEN, REDACTED),
)

# 这些字段承载定位 / 传输语义，必须原样保留：
# - source / relatedSources：目标文件路径，脱敏会导致执行端无法定位；
# - imageDataUrl：截图 Base64，替换后会破坏多模态输入；
# - 协议枚举与 ID：不是敏感正文，保留可减少误伤。
_PROTECTED_KEYS = frozenset(
    {
        "imageDataUrl",
        "source",
        "sourceKind",
        "relatedSources",
        "annotationId",
        "requestId",
        "protocolVersion",
        "type",
        "kind",
        "coordinateSpace",
        "tag",
    }
)


def redact_text(text: str) -> tuple[str, int]:
    """对单段文本执行全部脱敏规则，返回 (脱敏文本, 替换次数)。"""
    total = 0
    for pattern, replacement in _RULES:
        text, count = pattern.subn(replacement, text)
        total += count
    return text, total


def _walk(value: Any, key: str | None) -> tuple[Any, int]:
    """递归脱敏上下文；只重建 dict / list，不修改调用方对象。"""
    if key in _PROTECTED_KEYS:
        return value, 0
    if isinstance(value, str):
        return redact_text(value)
    if isinstance(value, list):
        items: list[Any] = []
        count = 0
        for item in value:
            sanitized, item_count = _walk(item, None)
            items.append(sanitized)
            count += item_count
        return items, count
    if isinstance(value, dict):
        result: dict[str, Any] = {}
        count = 0
        for item_key, item_value in value.items():
            sanitized, item_count = _walk(item_value, item_key)
            result[item_key] = sanitized
            count += item_count
        return result, count
    return value, 0


def redact_prompt_context(context: Mapping[str, Any]) -> tuple[dict[str, Any], int]:
    """在把上下文交给模型前执行脱敏，返回新上下文与替换次数。"""
    sanitized, count = _walk(dict(context), None)
    return sanitized, count
