#!/usr/bin/env bash
#
# 一键启动本地开发环境：
#   FastAPI  -> 127.0.0.1:8000
#   Canvas   -> 127.0.0.1:5174
#
# 两个服务各自运行在独立进程组中；按 Ctrl+C 或任一服务异常退出时，
# cleanup 会终止整个进程组，避免残留 uvicorn / vite 子进程。
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

API_HOST="${API_HOST:-127.0.0.1}"
API_PORT="${API_PORT:-8000}"
CANVAS_PORT="${CANVAS_PORT:-5174}"

API_PID=""
CANVAS_PID=""
CLEANING=0

log() {
  printf '[dev] %s\n' "$*"
}

die() {
  printf '[dev] 错误：%s\n' "$*" >&2
  exit 1
}

cleanup() {
  local status=$?

  # Ctrl+C 会再次触发 EXIT，确保只清理一次。
  if [[ "$CLEANING" -eq 1 ]]; then
    return
  fi
  CLEANING=1
  trap - EXIT INT TERM

  log "正在关闭服务..."
  if [[ -n "$CANVAS_PID" ]]; then
    kill -TERM -- "-$CANVAS_PID" 2>/dev/null ||
      kill -TERM "$CANVAS_PID" 2>/dev/null || true
  fi
  if [[ -n "$API_PID" ]]; then
    kill -TERM -- "-$API_PID" 2>/dev/null ||
      kill -TERM "$API_PID" 2>/dev/null || true
  fi

  # 给进程 3 秒优雅退出，然后强制清理整个进程组。
  local attempt
  for attempt in {1..30}; do
    local alive=0
    local pid
    for pid in "$CANVAS_PID" "$API_PID"; do
      if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
        alive=1
      fi
    done
    [[ "$alive" -eq 0 ]] && break
    sleep 0.1
  done

  local pid
  for pid in "$CANVAS_PID" "$API_PID"; do
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      kill -KILL -- "-$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null || true
    fi
  done

  wait "$CANVAS_PID" 2>/dev/null || true
  wait "$API_PID" 2>/dev/null || true
  log "已退出。"
  exit "$status"
}

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

command -v setsid >/dev/null 2>&1 || die "缺少 setsid（util-linux）。"
[[ -f .env ]] || die "缺少 .env；请先执行 cp .env.example .env。"
[[ -x .venv/bin/uvicorn ]] || die "缺少 .venv 或 uvicorn；请先安装 Python 依赖。"
[[ -d canvas-ui/node_modules ]] || die "缺少 canvas-ui/node_modules；请先执行 npm install。"

if ss -ltn 2>/dev/null | grep -qE ":(${API_PORT}|${CANVAS_PORT})[[:space:]]"; then
  die "端口 ${API_PORT} 或 ${CANVAS_PORT} 已被占用，请先停止旧服务。"
fi

log "启动 FastAPI  http://${API_HOST}:${API_PORT}"
setsid .venv/bin/uvicorn app.main:app \
  --host "$API_HOST" \
  --port "$API_PORT" \
  --reload &
API_PID=$!

log "启动 Canvas   http://${API_HOST}:${CANVAS_PORT}"
setsid bash -c \
  "cd '$ROOT_DIR/canvas-ui' && exec ./node_modules/.bin/vite --host '$API_HOST' --port '$CANVAS_PORT' --strictPort" &
CANVAS_PID=$!

log "服务已启动；按 Ctrl+C 退出。"

STATUS=0
wait -n "$API_PID" "$CANVAS_PID" || STATUS=$?
log "检测到服务退出（code=${STATUS}），开始清理。"
exit "$STATUS"
