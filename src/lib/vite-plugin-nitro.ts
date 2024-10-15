import { dirname, join, relative, resolve } from "node:path"
import { platform } from "node:os"
import process from "node:process"
import { fileURLToPath } from "node:url"
import type { NitroConfig } from "nitro/config"
import { build, createDevServer, createNitro } from "nitro"
import type { App } from "h3"
import { toNodeListener } from "h3"
import type { Plugin, ViteDevServer } from "vite"
import { mergeConfig, normalizePath } from "vite"
import { logger } from "../logger"
import { buildServer } from "./build-server"
import { isCloudflarePreset, isVercelPreset, withCloudflareOutput, withVercelOutputAPI } from "./preset"

const isWindows = platform() === "win32"
const filePrefix = isWindows ? "file:///" : ""
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export function nitro(nitroOptions?: NitroConfig): Plugin {
  const workspaceRoot = process.cwd()
  const apiPrefix = `/api`

  let isBuild = false
  let isServe = false
  let nitroConfig: NitroConfig

  return {
    name: "vite-plugin-with-nitro",
    async config(config, { command }) {
      isServe = command === "serve"
      isBuild = command === "build"
      const rootDir = relative(workspaceRoot, config.root || ".") || "."
      const buildPreset = process.env.BUILD_PRESET ?? (nitroOptions?.preset as string | undefined)

      const clientOutputPath = resolve(
        workspaceRoot,
        rootDir,
        config.build?.outDir || "dist",
      )

      const indexEntry = normalizePath(
        resolve(clientOutputPath, "index.html"),
      )

      nitroConfig = {
        rootDir,
        preset: buildPreset,
        logLevel: nitroOptions?.logLevel || 0,
        srcDir: normalizePath(`${rootDir}/server`),
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
        routeRules: {},
        renderer: filePrefix + normalizePath(join(__dirname, `runtime/renderer${filePrefix ? ".mjs" : ""}`)),
        alias: {
          "#nitro/index": indexEntry,
        },
      }

      if (isBuild) {
        nitroConfig.publicAssets = [{ dir: clientOutputPath }]
        /**
         * 开发阶段，采用的 vite middleware，挂载到 /api 上，但是在 nitro 上， /api/xx -> /xxx
         * 所以这个 proxy 只是用在生成环境下，也就是 build 之后。
         * vercel function 本来也是在 api 下。cloudflare page 有点类似本地 node，所以会导致刷新 404，
         * 因为本地是用的 tanstack router，是个虚拟 router，需要将 api 之外的 router proxy 到 / 上。
         */
        if (isVercelPreset(buildPreset)) {
          nitroConfig = withVercelOutputAPI(nitroConfig, workspaceRoot)
        } else {
          nitroConfig.routeRules![`/api/**`] = { proxy: "/**" }
          if (isCloudflarePreset(buildPreset)) {
            nitroConfig = withCloudflareOutput(nitroConfig)
          }
        }
      }

      nitroConfig = mergeConfig(
        nitroConfig,
        nitroOptions as Record<string, any>,
      )
    },
    async configureServer(viteServer: ViteDevServer) {
      if (!isServe) return
      const nitro = await createNitro({
        dev: true,
        ...nitroConfig,
      })
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
      await buildServer(nitroConfig)
      logger.success(`The server has been successfully built.`)
    },
  }
}
