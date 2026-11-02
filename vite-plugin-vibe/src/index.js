import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { parse } from '@babel/parser'
import traverseModule from '@babel/traverse'
import MagicString from 'magic-string'

const traverse = traverseModule.default ?? traverseModule
const SDK_FILE = fileURLToPath(new URL('./sdk.js', import.meta.url))

const DEFAULT_INCLUDE = /\.(?:jsx|tsx)$/
const SOURCE_FILE_PATTERN = /^[A-Za-z0-9._@/-]+\.(jsx|tsx|js|ts)$/
const MAX_SNIPPET_LINES = 40
const MAX_SNIPPET_BYTES = 4096
const MAX_SNAPSHOT_ELEMENTS = 200

function posixPath(value) {
  return value.split(path.sep).join('/')
}

function jsxName(node) {
  if (!node) return ''
  if (node.type === 'JSXIdentifier') return node.name
  if (node.type === 'JSXMemberExpression') {
    return `${jsxName(node.object)}.${jsxName(node.property)}`
  }
  if (node.type === 'JSXNamespacedName') {
    return `${jsxName(node.namespace)}:${jsxName(node.name)}`
  }
  return ''
}

function enclosingComponent(pathRef) {
  let current = pathRef.parentPath
  while (current) {
    const node = current.node
    if (
      (node.type === 'FunctionDeclaration' ||
        node.type === 'ClassDeclaration') &&
      node.id?.name
    ) {
      return node.id.name
    }
    if (
      node.type === 'VariableDeclarator' &&
      node.id?.type === 'Identifier' &&
      (node.init?.type === 'ArrowFunctionExpression' ||
        node.init?.type === 'FunctionExpression')
    ) {
      return node.id.name
    }
    if (
      (node.type === 'ObjectMethod' || node.type === 'ClassMethod') &&
      node.key?.type === 'Identifier'
    ) {
      return node.key.name
    }
    current = current.parentPath
  }
  return ''
}

function fileComponentName(filename) {
  return path
    .basename(filename)
    .replace(/\.[^.]+$/, '')
    .replace(/[^A-Za-z0-9_$]/g, '')
}

function escapeAttr(value) {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

function truncateSnippet(content, startLine) {
  const originalLines = content.split('\n').length
  let text = content
  let truncated = false

  const lines = text.split('\n')
  if (lines.length > MAX_SNIPPET_LINES) {
    text = lines.slice(0, MAX_SNIPPET_LINES).join('\n')
    truncated = true
  }

  if (Buffer.byteLength(text, 'utf8') > MAX_SNIPPET_BYTES) {
    text = Buffer.from(text, 'utf8')
      .subarray(0, MAX_SNIPPET_BYTES)
      .toString('utf8')
      .replace(/�+$/, '')
    truncated = true
  }

  text = text.trimEnd()
  return {
    source: '',
    startLine,
    endLine: startLine + Math.max(0, text.split('\n').length - 1),
    content: text,
    truncated,
    originalLineCount: originalLines,
    contentHash: `sha256:${createHash('sha256').update(text).digest('hex').slice(0, 16)}`,
  }
}

/**
 * 给单个 TSX/JSX 文件注入 data-source / data-source-kind / data-component。
 *
 * 返回值同时包含改写后的代码和源码片段注册表。片段来自注入前的原始代码，
 * 因此 Prompt 中不会出现工具自己注入的属性。
 */
function injectFile(code, filename, root) {
  const cleanFile = filename.split('?')[0]
  const relative = posixPath(path.relative(root, cleanFile))
  if (
    !relative ||
    relative.startsWith('..') ||
    path.isAbsolute(relative) ||
    !SOURCE_FILE_PATTERN.test(relative)
  ) {
    return null
  }

  const plugins = ['jsx']
  if (/\.[cm]?tsx?$/.test(cleanFile)) plugins.push('typescript')
  if (/\.[cm]?[jt]sx?$/.test(cleanFile)) plugins.push('decorators-legacy')

  let ast
  try {
    ast = parse(code, {
      sourceType: 'module',
      sourceFilename: relative,
      plugins,
    })
  } catch (error) {
    return { error }
  }

  const magic = new MagicString(code)
  const snippets = new Map()
  const fallbackComponent = fileComponentName(relative)

  traverse(ast, {
    JSXOpeningElement(pathRef) {
      const node = pathRef.node
      const alreadyInjected = node.attributes.some(
        (attribute) =>
          attribute.type === 'JSXAttribute' &&
          attribute.name?.name === 'data-source',
      )
      if (alreadyInjected) return

      const tag = jsxName(node.name)
      if (!tag) return
      // JSX 片段不能是 Fragment，也不能定位到空标签。
      const parent = pathRef.parentPath?.node
      if (!parent || parent.type !== 'JSXElement') return

      const line = node.loc?.start.line
      const column = node.loc?.start.column
      if (!line || column === undefined) return

      const source = `${relative}:${line}:${column + 1}`
      const isComponent = /^[A-Z]/.test(tag) || tag.includes('.')
      const component = isComponent
        ? tag.split('.')[0]
        : enclosingComponent(pathRef) || fallbackComponent
      const sourceKind = isComponent ? 'component-usage' : 'host'

      magic.appendLeft(
        node.name.end,
        ` data-source="${escapeAttr(source)}"` +
          ` data-source-kind="${sourceKind}"` +
          ` data-component="${escapeAttr(component)}"`,
      )

      const snippet = truncateSnippet(
        code.slice(parent.start, parent.end),
        parent.loc?.start.line ?? line,
      )
      snippet.source = source
      snippets.set(source, snippet)
    },
  })

  return {
    code: magic.hasChanged() ? magic.toString() : code,
    snippets,
  }
}

function apiError(res, status, message) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify({ status: 'error', error: { code: 'VIBE_PLUGIN', message } }))
}

/**
 * Vibe Canvas 的 Vite 插件（仅 dev server 生效）。
 *
 * 1. 在 React JSX 上注入 data-source（相对路径:行:列）、data-source-kind、
 *    data-component；
 * 2. 提供 /__vibe/snippets 源码片段注册表；
 * 3. 把本包的 sdk.js 注入 index.html，SDK 通过 postMessage 与画布握手。
 *
 * 生产构建完全不注入，避免源码行号、片段与 SDK 进入生产包。
 */
export default function vibePlugin(options = {}) {
  const include = options.include ?? DEFAULT_INCLUDE
  const registry = new Map()
  const fileSources = new Map()
  let root = process.cwd()

  return {
    name: 'vibe-canvas-preview',
    apply: 'serve',
    enforce: 'pre',

    configResolved(config) {
      root = config.root
    },

    configureServer(server) {
      server.middlewares.use('/@vibe/sdk.js', (req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          next()
          return
        }
        try {
          const source = readFileSync(SDK_FILE, 'utf8')
          res.statusCode = 200
          res.setHeader('Content-Type', 'text/javascript; charset=utf-8')
          res.setHeader('Cache-Control', 'no-store')
          res.end(req.method === 'HEAD' ? undefined : source)
        } catch (error) {
          apiError(res, 500, `SDK 读取失败：${error.message}`)
        }
      })

      server.middlewares.use('/__vibe/snippets', (req, res) => {
        if (req.method !== 'GET') {
          apiError(res, 405, '只支持 GET')
          return
        }
        const snippets = Object.fromEntries(registry)
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.setHeader('Cache-Control', 'no-store')
        res.end(
          JSON.stringify({
            apiVersion: 'v1',
            generatedAt: new Date().toISOString(),
            maxElements: MAX_SNAPSHOT_ELEMENTS,
            snippets,
          }),
        )
      })

      server.middlewares.use('/__vibe/health', (req, res) => {
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.setHeader('Cache-Control', 'no-store')
        res.end(
          JSON.stringify({
            status: 'ok',
            plugin: '@vibe/vite-plugin',
            version: '0.1.0',
            snippetCount: registry.size,
          }),
        )
      })
    },

    transform(code, id) {
      const cleanId = id.split('?')[0]
      const query = id.slice(cleanId.length)
      const isAssetQuery = /[?&](raw|url|inline|worker|sharedworker)(?:[=&]|$)/.test(
        query,
      )
      if (
        isAssetQuery ||
        !include.test(cleanId) ||
        cleanId.includes('/node_modules/') ||
        cleanId.startsWith('\0')
      ) {
        return null
      }

      const result = injectFile(code, cleanId, root)
      if (!result || result.error) {
        // 解析失败时清掉这个文件的旧片段，避免 HMR 后返回过期源码。
        for (const source of fileSources.get(cleanId) ?? []) registry.delete(source)
        fileSources.delete(cleanId)
        if (result?.error) {
          this.warn(
            `[vibe] 跳过 ${cleanId}：${result.error.message.split('\n')[0]}`,
          )
        }
        return null
      }

      for (const source of fileSources.get(cleanId) ?? []) registry.delete(source)
      fileSources.set(cleanId, new Set(result.snippets.keys()))
      for (const [source, snippet] of result.snippets) {
        registry.set(source, snippet)
      }

      return result.code === code ? null : { code: result.code, map: null }
    },

    transformIndexHtml() {
      return [
        {
          tag: 'script',
          attrs: { type: 'module', src: '/@vibe/sdk.js' },
          injectTo: 'head-prepend',
        },
      ]
    },
  }
}

export { MAX_SNIPPET_BYTES, MAX_SNIPPET_LINES, MAX_SNAPSHOT_ELEMENTS }
