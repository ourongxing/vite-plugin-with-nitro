import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import nitro from "vite-plugin-with-nitro"
import { resolve } from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        test: resolve(__dirname, './test/index.html'),
      },
    },
  },
  plugins: [
    react(),
    nitro({
      preset: "cloudflare-pages",
      // preset: "node-server"
    })
  ],
})
