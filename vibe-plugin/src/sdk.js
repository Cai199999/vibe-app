/**
 * Vibe Canvas Preview SDK.
 *
 * 这个文件由 @vibe/vite-plugin 注入到用户项目的 dev 页面。它不修改业务逻辑，
 * 只做三件事：
 *   1. 与父窗口（画布）握手；
 *   2. 扫描带 data-source 的 DOM，响应快照 / 命中 / 圈选；
 *   3. 返回插件在编译期收集的 JSX 源码片段。
 *
 * 坐标始终是 iframe 视口坐标；画布负责转换为 world 坐标。
 */
;(() => {
  'use strict'

  const PROTOCOL_VERSION = '0.1'
  const PROTOCOL_MAJOR = '0'
  const SDK_VERSION = '0.1.0'
  const PLUGIN_VERSION = '0.1.0'
  const MAX_SNAPSHOT_ELEMENTS = 200
  const MAX_TEXT_LENGTH = 200
  const MAX_NEIGHBORS = 6
  const MAX_SNIPPET_LINES = 40
  const MAX_SNIPPET_BYTES = 4096
  const HELLO_INTERVAL_MS = 500
  const MAX_HELLO_ATTEMPTS = 60
  const SNAPSHOT_DEBOUNCE_MS = 180

  const LAYOUT_KEYS = [
    'display',
    'position',
    'flexDirection',
    'justifyContent',
    'alignItems',
    'gap',
    'padding',
    'margin',
    'color',
    'backgroundColor',
    'fontSize',
    'fontWeight',
    'lineHeight',
    'borderRadius',
    'border',
  ]

  /** 只接受带协议主版本的字符串，避免未来大版本误连。 */
  const hasSupportedProtocol = (value) =>
    typeof value === 'string' && value.split('.')[0] === PROTOCOL_MAJOR

  const normalizeOrigin = (value) => {
    if (!value) return ''
    try {
      const parsed = new URL(value)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return ''
      return parsed.origin
    } catch {
      return ''
    }
  }

  const queryHost = new URLSearchParams(window.location.search).get(
    '__vibe_host',
  )
  // 优先使用画布显式传入的 Origin；referrer 只作为兼容回退。
  const HOST_ORIGIN =
    normalizeOrigin(queryHost) || normalizeOrigin(document.referrer)

  if (!HOST_ORIGIN || window.parent === window) return

  let sessionToken = null
  let revision = 0
  let helloAttempts = 0
  let helloTimer = null
  let snapshotTimer = null
  let snippets = Object.create(null)
  let snippetsLoadedAt = 0

  const envelope = (type, extra = {}) => ({
    protocolVersion: PROTOCOL_VERSION,
    type,
    messageId: `msg_${Math.random().toString(36).slice(2, 12)}`,
    timestamp: new Date().toISOString(),
    ...extra,
  })

  const send = (message) => {
    window.parent.postMessage(message, HOST_ORIGIN)
  }

  const errorOf = (code, message, details) => ({
    code,
    message,
    details,
    retryable: code === 'SNIPPET_NOT_FOUND',
  })

  const sendHello = () => {
    if (sessionToken) return
    if (helloAttempts >= MAX_HELLO_ATTEMPTS) {
      if (helloTimer) window.clearInterval(helloTimer)
      helloTimer = null
      return
    }
    helloAttempts += 1
    send(
      envelope('HELLO', {
        messageId: `msg_hello_${Math.random().toString(36).slice(2, 10)}`,
        sdkVersion: SDK_VERSION,
        pluginVersion: PLUGIN_VERSION,
        page: {
          origin: window.location.origin,
          pathname: window.location.pathname,
        },
        capabilities: {
          snapshot: true,
          hitTest: true,
          elementsInBox: true,
          sourceSnippet: true,
          maxSnapshotElements: MAX_SNAPSHOT_ELEMENTS,
          maxSnippetLines: MAX_SNIPPET_LINES,
          maxSnippetBytes: MAX_SNIPPET_BYTES,
        },
      }),
    )
  }

  const startHelloLoop = () => {
    if (helloTimer || sessionToken) return
    sendHello()
    helloTimer = window.setInterval(sendHello, HELLO_INTERVAL_MS)
  }

  const stopHelloLoop = () => {
    if (!helloTimer) return
    window.clearInterval(helloTimer)
    helloTimer = null
  }

  const loadSnippets = async (force = false) => {
    if (!force && Date.now() - snippetsLoadedAt < 1000) return
    try {
      const response = await fetch('/__vibe/snippets', {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const payload = await response.json()
      snippets = payload?.snippets ?? Object.create(null)
      snippetsLoadedAt = Date.now()
    } catch {
      // 注册表暂时不可用时仍允许快照，但片段请求会返回明确错误。
    }
  }

  const activeElements = () =>
    [...document.querySelectorAll('[data-source]')].filter((element) => {
      if (element.hasAttribute('data-vibe-ignore')) return false
      const style = window.getComputedStyle(element)
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        element.getClientRects().length > 0
      )
    })

  const sourceOf = (element) => element.getAttribute('data-source') || ''

  const componentOf = (element) => {
    const explicit = element.getAttribute('data-component')
    if (explicit) return explicit
    const filename = sourceOf(element).split('/').pop() || 'Unknown'
    return filename.replace(/\.[^.]+$/, '') || 'Unknown'
  }

  const sourceKindOf = (element) => {
    const kind = element.getAttribute('data-source-kind')
    if (kind === 'component-usage' || kind === 'component-root') return kind
    return 'host'
  }

  const rectOf = (element) => {
    const rect = element.getBoundingClientRect()
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    }
  }

  const textOf = (element) => {
    const text = (element.innerText || '').replace(/\s+/g, ' ').trim()
    return {
      text: text.slice(0, MAX_TEXT_LENGTH),
      truncated: text.length > MAX_TEXT_LENGTH,
    }
  }

  const layoutOf = (element) => {
    const style = window.getComputedStyle(element)
    const layout = {}
    LAYOUT_KEYS.forEach((key) => {
      const value = style[key]
      if (value) layout[key] = value
    })
    return layout
  }

  const sameSource = (source) =>
    activeElements().filter((element) => sourceOf(element) === source)

  const neighborsOf = (element) => {
    const output = []
    const push = (relation, candidate) => {
      if (!candidate || candidate === element || output.length >= MAX_NEIGHBORS) {
        return
      }
      const source = sourceOf(candidate)
      if (!source) return
      const text = textOf(candidate).text
      output.push({
        relation,
        elementId: candidate.dataset.vibeElementId,
        source,
        tag: candidate.tagName.toLowerCase(),
        component: componentOf(candidate),
        text: text || undefined,
      })
    }

    push('parent', element.parentElement?.closest('[data-source]'))

    const previous = element.previousElementSibling
    push(
      'prevSibling',
      previous?.matches('[data-source]')
        ? previous
        : previous?.querySelector('[data-source]'),
    )

    const next = element.nextElementSibling
    push(
      'nextSibling',
      next?.matches('[data-source]')
        ? next
        : next?.querySelector('[data-source]'),
    )

    push('firstChild', element.querySelector('[data-source]'))
    return output
  }

  const buildTarget = (element, includeContext) => {
    const source = sourceOf(element)
    const same = sameSource(source)
    const text = includeContext
      ? textOf(element)
      : { text: '', truncated: false }

    return {
      elementId: element.dataset.vibeElementId,
      source,
      sourceKind: sourceKindOf(element),
      component: componentOf(element),
      instance: Math.max(0, same.indexOf(element)),
      tag: element.tagName.toLowerCase(),
      text: includeContext ? text.text || undefined : undefined,
      rect: rectOf(element),
      coordinateSpace: 'iframe-viewport',
      layout: includeContext ? layoutOf(element) : undefined,
      neighbors: includeContext ? neighborsOf(element) : [],
      truncated: { text: text.truncated, neighbors: false },
      snippetAvailable: Boolean(snippets[source]),
    }
  }

  const truncateSnippet = (snippet, maxLines, maxBytes) => {
    let content = snippet.content
    let truncated = Boolean(snippet.truncated)
    const lines = content.split('\n')
    if (lines.length > maxLines) {
      content = lines.slice(0, maxLines).join('\n')
      truncated = true
    }
    if (new TextEncoder().encode(content).length > maxBytes) {
      const bytes = new TextEncoder().encode(content).slice(0, maxBytes)
      content = new TextDecoder().decode(bytes).replace(/�+$/, '')
      truncated = true
    }
    return {
      ...snippet,
      endLine: snippet.startLine + Math.max(0, content.split('\n').length - 1),
      content,
      truncated,
      originalLineCount: snippet.originalLineCount,
    }
  }

  const snippetOf = (source, maxLines = MAX_SNIPPET_LINES, maxBytes = MAX_SNIPPET_BYTES) => {
    const snippet = snippets[source]
    if (!snippet) return null
    return truncateSnippet(snippet, maxLines, maxBytes)
  }

  const assignElementIds = () => {
    activeElements().forEach((element, index) => {
      element.dataset.vibeElementId = `el_${index}`
    })
  }

  const sendSnapshot = () => {
    if (!sessionToken) return
    assignElementIds()
    const elements = activeElements()
    const limited = elements.slice(0, MAX_SNAPSHOT_ELEMENTS).map((element) => {
      let depth = 0
      let current = element
      while (current.parentElement && depth < 30) {
        depth += 1
        current = current.parentElement
      }
      return {
        ...buildTarget(element, true),
        depth,
        visible: true,
      }
    })

    revision += 1
    send(
      envelope('SNAPSHOT', {
        sessionToken,
        revision,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
          devicePixelRatio: window.devicePixelRatio,
        },
        scroll: { x: window.scrollX, y: window.scrollY },
        meta: {
          elementCount: elements.length,
          truncated: elements.length > MAX_SNAPSHOT_ELEMENTS,
          omittedCount: Math.max(0, elements.length - MAX_SNAPSHOT_ELEMENTS),
          generatedAt: new Date().toISOString(),
        },
        elements: limited,
      }),
    )
  }

  const sendResult = (request, type, extra) => {
    send(
      envelope(type, {
        replyTo: request.messageId,
        sessionToken,
        ...extra,
      }),
    )
  }

  const onHitTest = async (message) => {
    // HMR 可能刚加入新文件；命中前刷新一次注册表，避免误报 SNIPPET_NOT_FOUND。
    if (message.includeSnippet) await loadSnippets()
    assignElementIds()
    const x = Number(message.x)
    const y = Number(message.y)
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      sendResult(message, 'HIT_RESULT', {
        hit: false,
        target: null,
        error: errorOf('INVALID_MESSAGE', 'HIT_TEST 坐标无效。'),
      })
      return
    }

    const element = document.elementFromPoint(x, y)
    const target = element?.closest?.('[data-source]')
    if (!target || !document.documentElement.contains(target)) {
      sendResult(message, 'HIT_RESULT', {
        hit: false,
        target: null,
        error: errorOf(
          'SOURCE_NOT_FOUND',
          '该位置没有带 data-source 的元素，无法生成可定位的标注。',
          { x, y },
        ),
      })
      return
    }

    const source = sourceOf(target)
    const snippet = message.includeSnippet ? snippetOf(source) : null
    const extra = {
      hit: true,
      target: buildTarget(target, message.includeContext !== false),
    }
    if (snippet) extra.jsxSnippet = snippet
    if (message.includeSnippet && !snippet) {
      extra.error = errorOf(
        'SNIPPET_NOT_FOUND',
        '源码片段注册表未命中该 source，请确认插件已收集此文件。',
        { source },
      )
    }
    sendResult(message, 'HIT_RESULT', extra)
  }

  const intersects = (a, b) =>
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y

  const onElementsInBox = (message) => {
    assignElementIds()
    const limit = Math.max(1, Math.min(50, Number(message.limit) || 50))
    const rect = message.rect || {}
    const box = {
      x: Number(rect.x),
      y: Number(rect.y),
      width: Number(rect.width),
      height: Number(rect.height),
    }
    if (Object.values(box).some((value) => !Number.isFinite(value))) {
      sendResult(message, 'ELEMENTS_RESULT', {
        truncated: false,
        elements: [],
        error: errorOf('INVALID_MESSAGE', 'ELEMENTS_IN_BOX 矩形无效。'),
      })
      return
    }

    const matches = activeElements()
      .filter((element) => intersects(box, rectOf(element)))
      .sort((a, b) => {
        const areaA = rectOf(a).width * rectOf(a).height
        const areaB = rectOf(b).width * rectOf(b).height
        return areaB - areaA
      })

    const elements = matches.slice(0, limit).map((element) => {
      const target = buildTarget(element, true)
      if (message.includeSnippet) {
        const snippet = snippetOf(sourceOf(element))
        if (snippet) target.jsxSnippet = snippet
      }
      return target
    })

    sendResult(message, 'ELEMENTS_RESULT', {
      truncated: matches.length > limit,
      elements,
    })
  }

  const onSourceSnippet = async (message) => {
    await loadSnippets(true)
    const maxLines = Math.min(
      MAX_SNIPPET_LINES,
      Math.max(1, Number(message.maxLines) || MAX_SNIPPET_LINES),
    )
    const maxBytes = Math.min(
      MAX_SNIPPET_BYTES,
      Math.max(128, Number(message.maxBytes) || MAX_SNIPPET_BYTES),
    )
    const snippet = snippetOf(message.source, maxLines, maxBytes)
    if (!snippet) {
      sendResult(message, 'SOURCE_SNIPPET_RESULT', {
        found: false,
        jsxSnippet: null,
        error: errorOf(
          'SNIPPET_NOT_FOUND',
          '源码片段注册表未命中该 source。',
          { source: message.source },
        ),
      })
      return
    }
    sendResult(message, 'SOURCE_SNIPPET_RESULT', {
      found: true,
      jsxSnippet: snippet,
    })
  }

  const scheduleSnapshot = () => {
    if (!sessionToken || snapshotTimer) return
    snapshotTimer = window.setTimeout(() => {
      snapshotTimer = null
      // 最多每秒刷新一次注册表；HMR 后快照里的 snippetAvailable 也能更新。
      void loadSnippets().then(sendSnapshot)
    }, SNAPSHOT_DEBOUNCE_MS)
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window.parent || event.origin !== HOST_ORIGIN) return
    const message = event.data
    if (
      !message ||
      typeof message !== 'object' ||
      !hasSupportedProtocol(message.protocolVersion)
    ) {
      return
    }

    if (message.type === 'WELCOME') {
      const hostOrigin = normalizeOrigin(message.hostOrigin)
      if (hostOrigin && hostOrigin !== HOST_ORIGIN) return
      if (typeof message.sessionToken !== 'string' || !message.sessionToken) {
        return
      }
      if (sessionToken && message.sessionToken !== sessionToken) return

      sessionToken = message.sessionToken
      stopHelloLoop()
      void loadSnippets(true).then(sendSnapshot)
      return
    }

    if (!sessionToken || message.sessionToken !== sessionToken) return

    switch (message.type) {
      case 'PING':
        sendResult(message, 'PONG', {})
        break
      case 'SNAPSHOT_REQUEST':
        void loadSnippets(true).then(sendSnapshot)
        break
      case 'HIT_TEST':
        void onHitTest(message)
        break
      case 'ELEMENTS_IN_BOX':
        onElementsInBox(message)
        break
      case 'SOURCE_SNIPPET_REQUEST':
        void onSourceSnippet(message)
        break
      default:
        send(
          envelope('ERROR', {
            replyTo: message.messageId,
            sessionToken,
            error: errorOf(
              'INVALID_MESSAGE',
              `未知消息类型：${message.type}`,
            ),
          }),
        )
    }
  })

  // React HMR / 路由切换后 DOM 变化，自动补发快照。
  const observer = new MutationObserver(scheduleSnapshot)
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  })

  window.addEventListener('load', startHelloLoop, { once: true })
  window.addEventListener('beforeunload', () => {
    stopHelloLoop()
    observer.disconnect()
  })

  // 脚本在 head 中执行时 body 可能尚未出现；立即握手不依赖 DOM。
  startHelloLoop()
})()
