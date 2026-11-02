"""敏感信息脱敏测试：文本规则、上下文边界与幂等性。"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

import pytest

from app.core.redaction import REDACTED, redact_prompt_context, redact_text
from app.services.prompt_generator import GeneratedPrompt, RedactingPromptGenerator


def test_redacts_contacts_headers_and_tokens() -> None:
    text = (
        "联系 alice@example.com 或 13800138000；"
        "Authorization: Bearer abcdef123456；"
        "api_key=sk-abcdefghijklmnopqrstuvwxyz123456；"
        "password: 'hunter2'；"
        "jwt=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature123456"
    )

    redacted, count = redact_text(text)

    assert "alice@example.com" not in redacted
    assert "13800138000" not in redacted
    assert "abcdef123456" not in redacted
    assert "sk-abcdefghijklmnopqrstuvwxyz123456" not in redacted
    assert "hunter2" not in redacted
    assert "eyJhbGciOiJIUzI1NiJ9" not in redacted
    assert count >= 6
    assert REDACTED in redacted
    # 键名保留，方便模型理解这里是脱敏后的凭据。
    assert "api_key=" in redacted
    assert "Authorization: Bearer" in redacted


def test_redacts_private_key_block_and_cloud_tokens() -> None:
    private_key = (
        "-----BEGIN RSA PRIVATE KEY-----\n"
        "MIIEowIBAAKCAQEA1234567890abcdef\n"
        "-----END RSA PRIVATE KEY-----"
    )
    text = (
        f"{private_key}\n"
        "AKIAIOSFODNN7EXAMPLE\n"
        "ghp_abcdefghijklmnopqrstuvwxyz0123456789\n"
        "xoxb-1234567890-abcdefghijkl\n"
        "AIzaSyA1234567890abcdefghijklmnopqrstuv\n"
        "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6"
    )

    redacted, count = redact_text(text)

    assert "BEGIN RSA PRIVATE KEY" not in redacted
    assert "AKIAIOSFODNN7EXAMPLE" not in redacted
    assert "ghp_abcdefghijklmnopqrstuvwxyz0123456789" not in redacted
    assert "xoxb-1234567890-abcdefghijkl" not in redacted
    assert "AIzaSyA1234567890abcdefghijklmnopqrstuv" not in redacted
    assert "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6" not in redacted
    assert count >= 6


def test_keeps_normal_jsx_unchanged() -> None:
    """普通 JSX、类名与事件处理函数不能被误伤。"""
    text = '<button className="primary" onClick={handleSubmit}>' "提交订单</button>"

    redacted, count = redact_text(text)

    assert redacted == text
    assert count == 0


def test_redacts_url_embedded_credentials_only() -> None:
    """URL 内嵌凭据只替换密码，保留用户名、主机与普通 URL。"""
    text = (
        "生产库 postgresql://admin:s3cr3t-pass@db.internal:5432/app；"
        "普通地址 https://registry.example.com/path 不能被误伤。"
    )

    redacted, count = redact_text(text)

    assert "s3cr3t-pass" not in redacted
    assert "postgresql://admin:[REDACTED]@db.internal:5432/app" in redacted
    assert "https://registry.example.com/path" in redacted
    assert count == 1


def test_keeps_uuid_and_hex_digests() -> None:
    """标准 UUID / MD5 / SHA1 走白名单，长串 Token 仍然脱敏。"""
    uuid = "550e8400-e29b-41d4-a716-446655440000"
    md5 = "d41d8cd98f00b204e9800998ecf8427e"
    sha1 = "da39a3ee5e6b4b0d3255bfef95601890afd80709"
    opaque_token = "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0"

    redacted, count = redact_text(f"{uuid}\n{md5}\n{sha1}\n{opaque_token}")

    assert uuid in redacted
    assert md5 in redacted
    assert sha1 in redacted
    assert opaque_token not in redacted
    assert count == 1
    # 白名单规则不能污染上下文中的普通 ID 字段。
    sanitized, context_count = redact_prompt_context(
        {"annotations": [{"annotationId": uuid, "intent": f"引用哈希 {sha1}"}]}
    )
    assert sanitized["annotations"][0]["annotationId"] == uuid
    assert sha1 in sanitized["annotations"][0]["intent"]
    assert context_count == 0


def test_redacts_context_but_keeps_source_and_image() -> None:
    image = "data:image/png;base64," + "A" * 2048
    context: dict[str, Any] = {
        "imageDataUrl": image,
        "project": {"name": "alice@example.com 的项目"},
        "annotations": [
            {
                "annotationId": "ann_1",
                "type": "note",
                "intent": "联系 alice@example.com 或 13800138000",
                "target": {
                    "source": "src/alice@example.com/13800138000/App.tsx:1:1",
                    "sourceKind": "host",
                    "text": "邮箱 alice@example.com",
                    "layout": {"backgroundImage": "url(token=abcdef123456)"},
                },
                "jsxSnippet": {
                    "source": "src/alice@example.com/13800138000/App.tsx:1:1",
                    "content": '<a href="mailto:alice@example.com">联系</a>',
                },
            }
        ],
    }

    sanitized, count = redact_prompt_context(context)

    assert count >= 3
    assert sanitized["imageDataUrl"] is image
    annotation = sanitized["annotations"][0]
    source = "src/alice@example.com/13800138000/App.tsx:1:1"
    assert annotation["target"]["source"] == source
    assert annotation["jsxSnippet"]["source"] == source
    assert "alice@example.com" not in annotation["intent"]
    assert "13800138000" not in annotation["intent"]
    assert "alice@example.com" not in annotation["target"]["text"]
    assert "alice@example.com" not in annotation["jsxSnippet"]["content"]
    assert "alice@example.com" not in sanitized["project"]["name"]


def test_redaction_is_idempotent() -> None:
    redacted, count = redact_text("alice@example.com / api_key=abc12345")
    assert count == 2

    again, second_count = redact_text(redacted)
    assert again == redacted
    assert second_count == 0


class _CaptureGenerator:
    provider = "fake"
    model = "fake-model"
    supports_images = False

    def __init__(self) -> None:
        self.context: dict[str, Any] | None = None

    async def generate(self, context: dict[str, Any]) -> GeneratedPrompt:
        self.context = context
        return GeneratedPrompt(
            content="ok",
            provider=self.provider,
            model=self.model,
        )


def test_redacting_generator_wraps_context() -> None:
    inner = _CaptureGenerator()
    generator = RedactingPromptGenerator(inner)

    asyncio.run(
        generator.generate(
            {
                "annotations": [
                    {"intent": "联系 alice@example.com", "source": "src/App.tsx:1:1"}
                ]
            }
        )
    )

    assert inner.context is not None
    assert "alice@example.com" not in inner.context["annotations"][0]["intent"]
    assert inner.context["annotations"][0]["source"] == "src/App.tsx:1:1"
    assert generator.provider == "fake"
    assert generator.supports_images is False


def test_redacting_generator_logs_count_not_content(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """日志只允许出现替换数量，不能出现原文或脱敏后的正文。"""
    inner = _CaptureGenerator()
    generator = RedactingPromptGenerator(inner)

    with caplog.at_level(logging.INFO):
        asyncio.run(
            generator.generate(
                {"annotations": [{"intent": "联系 alice@example.com 或 13800138000"}]}
            )
        )

    assert "prompt_context_redacted replacements=2" in caplog.text
    assert "alice@example.com" not in caplog.text
    assert "13800138000" not in caplog.text
