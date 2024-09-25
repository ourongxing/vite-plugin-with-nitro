import { resolve } from "node:path"
import type { NitroConfig } from "nitropack"
import type { ConfigEnv, Plugin, UserConfig } from "vite"
import { vi } from "vitest"

export const mockViteDevServer = {
  middlewares: {
    use: () => {},
  },
}

export const mockNitroConfig: NitroConfig = {
  buildDir: resolve("./dist/.nitro"),
  preset: undefined,
  handlers: [],
  logLevel: 0,
  output: {
    dir: resolve("dist/output"),
    publicDir: resolve("dist/output/public"),
  },
  rootDir: ".",
  scanDirs: ["src/server"],
  srcDir: "src/server",
  prerender: {
    crawlLinks: undefined,
  },
  typescript: {
    generateTsConfig: false,
  },
  rollupConfig: {
    plugins: [
      {
        name: "rollup-page-endpoint",
        transform() {},
      },
    ],
  },
}

export async function mockBuildFunctions() {
  const buildServerImport = await import("./build-server")
  const buildServerImportSpy = vi.fn()
  buildServerImport.buildServer = buildServerImportSpy

  const buildSSRAppImport = await import("./build-ssr")
  const buildSSRAppImportSpy = vi.fn()
  buildSSRAppImport.buildSSRApp = buildSSRAppImportSpy

  const buildSitemapImport = await import("./build-sitemap")
  const buildSitemapImportSpy = vi.fn()
  buildSitemapImport.buildSitemap = buildSitemapImportSpy

  return { buildSSRAppImportSpy, buildServerImportSpy, buildSitemapImportSpy }
}

export async function runConfigAndCloseBundle(plugin: Plugin[]): Promise<void> {
  await (
    plugin[1].config as (
      config: UserConfig,
      env: ConfigEnv
    ) => Promise<UserConfig>
  )({}, { command: "build" } as ConfigEnv)
  await (plugin[1].closeBundle as () => Promise<void>)()
}
