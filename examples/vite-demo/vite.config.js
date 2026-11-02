import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import vibe from '@vibe/vite-plugin'

export default defineConfig({
  // vibe() 放在 react() 前并设置 enforce: 'pre'，确保注入发生在 JSX 编译前。
  plugins: [vibe(), react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
})
