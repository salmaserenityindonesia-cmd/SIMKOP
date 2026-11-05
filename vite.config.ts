import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // @ts-expect-error vitest configuration in vite config
  test: {
    testTimeout: 10000,
  },
})

