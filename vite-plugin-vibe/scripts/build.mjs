import { cp, mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
)
const sourceDir = path.join(packageRoot, 'src')
const outputDir = path.join(packageRoot, 'dist')

// 插件运行时通过 import.meta.url 读取同目录的 sdk.js，
// 因此 index.js 与 sdk.js 必须一起进入 dist，不能单独打包 index。
const files = ['index.js', 'sdk.js']

await rm(outputDir, { recursive: true, force: true })
await mkdir(outputDir, { recursive: true })

for (const file of files) {
  await cp(path.join(sourceDir, file), path.join(outputDir, file))
}

console.log(`[vibe] built ${files.join(', ')} -> dist/`)
