import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

// Default entries: src/main/index.ts and src/renderer/index.html
export default defineConfig({
  main: {},
  renderer: {
    plugins: [react()]
  }
})
