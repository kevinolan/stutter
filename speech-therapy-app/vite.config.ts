import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// Use Vitest's defineConfig so the `test` field is type-checked (Vite's own
// defineConfig does not know about it, which previously broke `tsc -b`).
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
  },
})
