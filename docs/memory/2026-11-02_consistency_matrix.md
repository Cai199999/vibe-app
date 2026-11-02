# 一致性矩阵测试报告（2026-11-02）

## 结论

**全部绿灯。** 前后端请求契约、四种模型 / 模式组合、旧配置兼容、脱敏后 JSON 完整性
均通过；未发现需要修复的字段名或类型不一致。

- 后端全量回归：**112 项通过**（原 101 项 + 新增 11 项一致性矩阵测试）。
- 前端：`npm run build`、`npm run lint` 通过。
- 真实启动验证：仅配置 `PROMPT_PROVIDER=deepseek` 时，独立进程在 8011 端口正常启动，
  `/api/v1/capabilities` 返回 `provider=deepseek`、`model=deepseek-chat`。
- 所有模型调用均使用 `httpx.MockTransport`，未访问外网、未调用真实 DeepSeek / Ollama。

## 测试文件

`tests/test_consistency_matrix.py`

## 1. 前后端契约一致性

静态解析 `canvas-ui/src/types/vibe.ts`，与 Pydantic `model_json_schema(by_alias=True)`
逐字段比对：

| 前端接口 | 后端模型 | 字段名 | 类型 |
|---|---|---|---|
| `PromptGenerateRequest` | `PromptGenerateRequest` | 一致 | 一致 |
| `ApiTarget` | `Target` | 一致 | 一致 |
| `ApiVisual` | `Visual` | 一致 | 一致 |
| `ApiDrag` | `Drag` | 一致 | 一致 |
| `JSXSnippet` | `JSXSnippet` | 一致 | 一致 |
| `Neighbor` | `Neighbor` | 一致 | 一致 |
| `Rect` | `Rect` | 一致 | 一致 |
| `Point` | `Point` | 一致 | 一致 |
| `GenerateOptions` | `GenerateOptions` | 一致 | 一致 |

额外校验：

- 前端标注联合类型 `ApiSourceAnnotation` / `ApiVisualAnnotation` 的字段均被后端
  `Annotation` 接收；
- `PromptGenerateRequest.project` 内联字段 `name` / `framework` / `previewOrigin`
  与 `ProjectInfo` 对齐；
- 后端必填字段没有被前端声明为可选；
- 字符串字面量联合、数组、对象引用、可空字段均按统一口径比较。

## 2. 交叉状态矩阵

| 编号 | 组合 | 预期 | 结果 |
|---|---|---|---|
| M1 | 云端 + 源码 | 使用 `deepseek-chat`、Bearer 鉴权，上下文含 JSX 片段，无图片 | 通过 |
| M2 | 云端 + 视觉 | 使用 `deepseek-flash`，以 `image_url` content part 发送截图 | 通过 |
| M3 | Ollama + 源码 | 请求 `/v1/chat/completions`，无 `Authorization`，使用 `qwen2.5:7b` | 通过 |
| M4 | Ollama + 视觉（未配 `OLLAMA_VISION_MODEL`） | HTTP 502，`MODEL_UNAVAILABLE`，不发起上游请求 | 通过 |

M4 补充验证：

- 错误属于配置错误，`retryable=false`，重试不会成功；
- 前端 `promptApi.ts` 将 `body.error.code` 原样写入 `PromptApiError.code`；
- `usePromptGeneration` 写入 `error.code`，`PromptResult` 渲染 `error.message`，
  因此 `MODEL_UNAVAILABLE` 能显示给用户。

## 3. 配置兼容性

| 场景 | 验证方式 | 结果 |
|---|---|---|
| 仅 `PROMPT_PROVIDER=deepseek`，无 `LLM_PROVIDER` | `Settings(_env_file=None)` + 环境变量 | `llm_provider=deepseek`，生成器为 DeepSeek |
| 同时配置新旧变量 | 环境变量 | `LLM_PROVIDER` 优先 |
| 真实进程启动 | `env -u LLM_PROVIDER PROMPT_PROVIDER=deepseek uvicorn ... --port 8011` | 启动成功，capabilities 返回 `deepseek` |

## 4. 脱敏与 JSON 结构一致性

构造含邮箱、OpenAI Key、URL 内嵌密码的 JSX 片段与旁注，经
`RedactingPromptGenerator` + `OllamaPromptGenerator` 发送，捕获实际请求体：

- 整个请求体可被 `json.loads` 解析；
- `<vibe_context>` 内的 JSON 可再次解析；
- 邮箱、`sk-...`、URL 密码不再出现；
- URL 脱敏保留 `postgresql://admin:[REDACTED]@db.internal/app`；
- JSX 标签、`className`、`onClick={handleSubmit}`、引号与花括号保持完整；
- `target.source` 与 `jsxSnippet.source` 未被破坏。

## 验证命令

```bash
.venv/bin/black app tests
.venv/bin/python -m pytest -q
cd canvas-ui && npm run build && npm run lint
```

## 已知边界

- 契约测试覆盖 L3 请求 DTO；响应 DTO 由现有 API 测试覆盖。
- 前端错误提示通过源码链路断言，属于静态契约验证；本环境未执行浏览器 E2E。
- 契约解析器针对当前 `vibe.ts` 的接口语法；新增复杂泛型 / 条件类型时需要扩展。
