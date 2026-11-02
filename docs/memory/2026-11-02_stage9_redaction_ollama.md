# 阶段九：敏感信息脱敏与 Ollama 本地模型（2026-11-02）

## 目标与决策

在不改变“只生成 Prompt、不直接改代码”定位的前提下，补齐两项生产可用能力：

- 发送给模型前对文本与 JSX 做前置脱敏，降低 AK/SK、Token、手机号、邮箱外发风险；
- 支持 `LLM_PROVIDER=ollama`，通过本地 / 局域网 Ollama 完全离线运行。

## 实现

### 脱敏

- `app/core/redaction.py`（新增）：
  - 邮箱、中国大陆手机号；
  - `Authorization: Bearer / Basic / Token ...`；
  - `api_key` / `secret` / `password` / `token` 等键值对；
  - OpenAI、AWS、GitHub、Slack、Google 固定前缀 Token、JWT、PEM 私钥块；
  - 32–128 位且同时含字母与数字的可疑长串。
  - 命中统一替换为 `[REDACTED]`，保留键名与引号；
  - 文件路径、`sourceKind`、`relatedSources`、`annotationId`、`imageDataUrl` 原样保留；
  - 对同一文本重复执行不会二次替换（幂等）。
- `app/services/prompt_generator.py`：新增 `RedactingPromptGenerator` 中间件。
  `build_prompt_generator()` 在 `REDACT_SENSITIVE=true` 时自动包装 Mock / DeepSeek / Ollama，
  确保所有模型路径都在调用前脱敏；日志只记录替换次数，不记录正文。
- 截图 Base64 不参与文本脱敏，图片中的敏感内容仍需用户自行处理。

### Ollama

- `app/config.py`：
  - `llm_provider` 同时接受 `LLM_PROVIDER` 与旧变量 `PROMPT_PROVIDER`，
    `LLM_PROVIDER` 优先；
  - 新增 `OLLAMA_BASE_URL`、`OLLAMA_MODEL`、`OLLAMA_VISION_MODEL`、
    `OLLAMA_TIMEOUT_SECONDS`、`OLLAMA_MAX_TOKENS`、`OLLAMA_TEMPERATURE`、
    `OLLAMA_API_KEY`。
- `app/services/prompt_generator.py`：
  - 抽出 `_OpenAICompatiblePromptGenerator`，共享 DeepSeek / Ollama 的
    `/chat/completions` 请求、错误映射与 usage 解析；
  - Ollama 默认请求 `{base}/v1/chat/completions`；base 已带 `/v1` 时不重复拼接；
  - 直连不发送 `Authorization`；配置 `OLLAMA_API_KEY` 时按 Bearer 发送（适配网关）；
  - 未配置 `OLLAMA_VISION_MODEL` 时，携带截图直接返回 `MODEL_UNAVAILABLE`，不发请求；
  - 连接失败提示检查 `ollama serve` 与 `OLLAMA_BASE_URL`。
- `/api/v1/capabilities`：
  - `model.provider` 支持 `deepseek` / `ollama` / `mock`；
  - Ollama 返回 `OLLAMA_MODEL`、`OLLAMA_VISION_MODEL` 与 `multimodal`；
  - 新增 `features.redactionEnabled`。

## 配置

```env
# 统一模型提供方：mock / deepseek / ollama
LLM_PROVIDER=ollama

# 发送前脱敏，默认开启
REDACT_SENSITIVE=true

# Ollama 本地 / 局域网
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5:7b
# 留空表示不支持截图
OLLAMA_VISION_MODEL=qwen2.5vl:7b
OLLAMA_TIMEOUT_SECONDS=120
OLLAMA_MAX_SNIPPET_CHARS=2000
OLLAMA_API_KEY=
```

启动前拉取模型：

```bash
ollama pull qwen2.5:7b
ollama pull qwen2.5vl:7b   # 可选，视觉模式
ollama serve               # 未作为服务常驻时手动启动
```

局域网内另一台机器使用时，将 `OLLAMA_BASE_URL` 改为目标机器的
`http://<IP>:11434`，并确认 Ollama 监听地址与防火墙允许访问。

修改 `.env` 后必须重启 FastAPI；访问 `/api/v1/capabilities` 确认
`model.provider=ollama` 与视觉模型声明。

## 脱敏验证方式

1. 在画布旁注中输入：`联系 alice@example.com 或 13800138000`。
2. 生成后检查 Markdown：原文应变为 `[REDACTED]`，目标文件路径保持不变。
3. 也可直接运行：

```bash
.venv/bin/python - <<'PY'
from app.core.redaction import redact_text
print(redact_text("alice@example.com 13800138000 api_key=abc12345"))
PY
```

## 测试结果

- 后端：`pytest` **101 项通过**，新增覆盖：
  - 邮箱、手机号、Authorization、键值对、JWT、私钥、云厂商 Token、长串；
  - URL 内嵌密码只脱敏密码，普通 URL 不受影响；
  - UUID / MD5 / SHA1 白名单保留且不计入替换数；
  - 普通 JSX 不误伤、`source` / `imageDataUrl` 保留、幂等；
  - 服务链路与 HTTP API 均确认敏感文本不进入 Prompt；
  - `REDACT_SENSITIVE=false` 时保留原文；
  - Ollama 地址拼接、无鉴权、网关 Bearer、文本 / 视觉模型路由；
  - Ollama 超长 JSX 截断、短片段不变、调用方上下文不被修改；
  - Ollama System Prompt 寒暄 / 代码围栏约束，DeepSeek 不继承；
  - 异常处理日志不含异常消息、手机号、邮箱或 traceback；
  - 未配置视觉模型或模型名时返回 `MODEL_UNAVAILABLE`；
  - `LLM_PROVIDER` 优先于 `PROMPT_PROVIDER`；
  - `/capabilities` 正确声明 Ollama 与 `redactionEnabled`。
- 所有 Ollama 测试使用 `httpx.MockTransport`，不依赖真实 Ollama，也不访问外网。
- 前端：`npm run build` 与 `npm run lint` 通过。

## 发布前加固（2026-11-02）

- 脱敏白名单：标准 UUID（含连字符）与 32 位 MD5 / 40 位 SHA1 全十六进制摘要
  不再被长串规则误杀，且不计入替换数；其他 32–128 位可疑长串仍替换为 `[REDACTED]`。
- URL 内嵌凭据：新增 `协议://用户名:密码@域名` 规则，只替换密码，
  保留协议、用户名与主机，普通 URL 不受影响。
- Ollama 上下文保护：请求前把单个 `jsxSnippet.content` 截断到
  `OLLAMA_MAX_SNIPPET_CHARS`（默认 2000），末尾追加 `[代码过长已截断]`，
  并标记 `truncated=true`；截断基于发送副本，不修改调用方对象。
- Ollama 输出约束：System Prompt 追加“直接输出最终 Markdown、不寒暄、
  不使用整段 ```markdown 围栏、直接输出纯文本”的硬指令；DeepSeek 不继承该后缀。
- 日志安全：全局异常处理器只记录异常类型与请求路径，不使用 `logger.exception`，
  不记录异常消息、traceback、`request.body` 或原始 Prompt。
- 前端视觉隐私提示：画布视觉模式与标注弹窗常驻显示
  “🔒 提示：请确保截图中不包含明文密码、Token 等敏感信息，云端模型无法为您对图片内容脱敏。”

## 已知限制

- 脱敏是正则启发式：变形 / 拼接 / 编码后的密钥、截图内文字无法识别；
  UUID / MD5 / SHA1 以外的普通长串仍可能被替换为 `[REDACTED]`。
- Ollama 截断会让模型只看到片段前 2000 字符（含截断标记），
  超长组件的后半部分需由执行端读取真实文件补全。
- Ollama 模型能力差异较大；本地小模型的 Prompt 质量、JSON 上下文理解与视觉能力
  需按实际模型评估。
- 视觉模式必须显式配置 `OLLAMA_VISION_MODEL`，否则后端硬阻断，不会静默降级。
- Ollama 直连为 HTTP；跨机器使用时请注意内网信任边界。
