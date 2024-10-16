import { dirname, join, relative, resolve } from "node:path"
import { platform } from "node:os"
import process from "node:process"
import { fileURLToPath } from "node:url"
import type { NitroConfig } from "nitropack/config"
import { build, copyPublicAssets, createDevServer, createNitro, prepare, prerender } from "nitropack"
import type { App } from "h3"
import { toNodeListener } from "h3"
import type { Plugin, ViteDevServer } from "vite"
import { normalizePath } from "vite"
import defu from "defu"
import { logger } from "./logger"
import { withPreset } from "./preset"

const isWindows = platform() === "win32"
const filePrefix = isWindows ? "file:///" : ""
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export function nitro(nitroOptions?: NitroConfig): Plugin {
  const workspaceRoot = process.cwd()
  const apiPrefix = "/api"

  let isBuild = false
  let isServe = false
  let nitroConfig: NitroConfig = {}
  let clientOutputPath = ""

  return {
    name: "vite-plugin-with-nitro",
    async config(config, { command }) {
      isServe = command === "serve"
      isBuild = command === "build"
      const rootDir = relative(workspaceRoot, config.root || ".") || "."
      clientOutputPath = resolve(
        workspaceRoot,
        rootDir,
        config.build?.outDir || "dist",
      )

      nitroConfig = defu<NitroConfig, NitroConfig[]>(nitroOptions, {
        rootDir,
        srcDir: normalizePath(`${rootDir}/${nitroOptions?.srcDir || "server"}`),
        preset: process.env.BUILD_PRESET,
        compatibilityDate: "2024-10-16",
        output: {
          dir: normalizePath(
            resolve(workspaceRoot, "dist", rootDir, "output"),
          ),
          publicDir: normalizePath(
            resolve(workspaceRoot, "dist", rootDir, "output/public"),
          ),
        },
        buildDir: normalizePath(
          resolve(workspaceRoot, "dist", rootDir, ".nitro"),
        ),
      })
    },
    async configureServer(viteServer: ViteDevServer) {
      if (!isServe) return
      const devConfig = defu<NitroConfig, NitroConfig[]>({
        dev: true,
        routeRules: {
          "/**": { proxy: `${apiPrefix}/**` },
        },
      }, nitroConfig)

      const nitro = await createNitro(devConfig)
      const server = createDevServer(nitro)
      await build(nitro)

      viteServer.middlewares.use(apiPrefix, toNodeListener(server.app as unknown as App))

      viteServer.httpServer?.once("listening", () => {
        const { host, port } = viteServer.config.server
        process.env.NITRO_HOST = host ? String(host) : "localhost"
        process.env.NITRO_PORT = String(port)
      })

      logger.info(`The server endpoints are accessible under the "${apiPrefix}" path.`)
    },
    async closeBundle() {
      if (!isBuild) return

      const buildConfig = defu<NitroConfig, NitroConfig[]>(
        withPreset(nitroConfig.preset || "node-server", workspaceRoot),
        {
          dev: false,
          publicAssets: [{ dir: clientOutputPath }],
          renderer: filePrefix + normalizePath(join(__dirname, `runtime/renderer${filePrefix ? ".mjs" : ""}`)),
          alias: {
            "#nitro/index": normalizePath(
              resolve(clientOutputPath, "index.html"),
            ),
          },
        },
        nitroConfig,
      )

      const nitro = await createNitro(buildConfig)
      await prepare(nitro)
      await copyPublicAssets(nitro)

      if (
        nitroConfig?.prerender?.routes
        && nitroConfig?.prerender?.routes?.length > 0
      ) {
        logger.start(`Prerendering static pages...`)
        await prerender(nitro)
      }

      if (!nitroConfig?.static) {
        logger.start("Building Server...")
        await build(nitro)
      }

      await nitro.close()
      logger.success(`The server has been successfully built.`)
    },
  }
}
