# @vibe/vite-plugin

Vibe Canvas 的开发期 Vite 插件。它只影响 `vite dev`：

1. 给第一方 JSX/TSX 的每个 JSX 元素注入：

   ```html
   data-source="src/components/Card.tsx:12:5"
   data-source-kind="host|component-usage"
   data-component="Card"
   ```

2. 在 `index.html` 头部自动注入 `/@vibe/sdk.js`；
3. 在内存中维护源码片段注册表，并通过 `/__vibe/snippets` 提供给 SDK；
4. 生产构建不注入任何属性、片段或 SDK。

## 接入用户项目

```bash
# 本地联调示意；正式使用可发布到私有 npm
npm install -D file:/home/admin1/Workspace/vibe-app/vibe-plugin
```

```js
// vite.config.js
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import vibe from '@vibe/vite-plugin'

export default defineConfig({
  // vibe 必须在 react 之前执行；插件自身也声明了 enforce: 'pre'。
  plugins: [vibe(), react()],
})
```

启动项目：

```bash
npm run dev -- --host 127.0.0.1 --port 5173
```

然后在画布输入 `http://127.0.0.1:5173`。不需要导入 HTML 文件，也不需要手写 SDK 脚本。

## 选项

```js
vibe({
  // 默认只处理 .jsx / .tsx；如果项目使用 .js 写 JSX，可显式放宽。
  include: /\.(jsx|tsx)$/,
})
```

## 端点（仅 dev server）

| 路径 | 用途 |
|---|---|
| `/@vibe/sdk.js` | 注入到页面的浏览器 SDK |
| `/__vibe/snippets` | `data-source → JSX 片段`注册表 |
| `/__vibe/health` | 插件状态与已收集片段数量 |

## 边界

- 只处理 Vite root 内、文件名符合后端 Source 正则的第一方文件；`node_modules` 不处理。
- 组件若吞掉未知 props，`data-source` 可能不落到 DOM；此时可用组件内部根宿主节点的锚点，或该元素不可提交。
- 动态字符串/`innerHTML`/第三方 DOM 不在编译期覆盖范围。
- Fragment、非 JSX 节点不注入。
- HMR 会重新收集当前文件片段；历史行号可能随源码编辑改变，这是 dev 期预期行为。

## 验证

```bash
curl http://127.0.0.1:5173/__vibe/health
curl http://127.0.0.1:5173/__vibe/snippets
curl http://127.0.0.1:5173/src/App.jsx | grep data-source
```
