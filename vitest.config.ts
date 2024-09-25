import { defineConfig } from "vitest/config"
import tsconfigPath from "vite-tsconfig-paths"

export default defineConfig(() => ({
  plugins: [tsconfigPath()],
  test: {
    reporters: ["default"],
    globals: true,
    include: ["src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
  },
}))
