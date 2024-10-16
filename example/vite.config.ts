import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import nitro from "vite-plugin-with-nitro"

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    nitro({
      compatibilityDate: '2024-10-16',
      preset: "cloudflare-pages"
    })
  ],
})
