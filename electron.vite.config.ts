import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

// Default entries: src/main/index.ts, src/preload/index.ts and src/renderer/index.html,
// plus src/main/mcp.ts, the vault MCP server the Claude CLI starts as its own process.
export default defineConfig({
  main: {
    build: { rollupOptions: { input: { index: 'src/main/index.ts', mcp: 'src/main/mcp.ts' } } }
  },
  preload: {},
  renderer: {
    plugins: [react()]
  }
})
