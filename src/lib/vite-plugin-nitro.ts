import { relative, resolve } from "node:path"
import process from "node:process"
import type { NitroConfig } from "nitropack"
import { build, createDevServer, createNitro } from "nitropack"
import type { App } from "h3"
import { toNodeListener } from "h3"
import type { Plugin, ViteDevServer } from "vite"
import { mergeConfig, normalizePath } from "vite"
import { logger } from "../logger"
import { buildServer } from "./build-server"
import { isCloudflarePreset, isVercelPreset, withCloudflareOutput, withVercelOutputAPI } from "./preset"

export function nitro(nitroOptions?: NitroConfig): Plugin {
  const workspaceRoot = process.cwd()
  const apiPrefix = `/${nitroOptions?.runtimeConfig?.apiPrefix ?? "api"}`

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
        typescript: {
          generateTsConfig: false,
        },
        routeRules: {
          [`${apiPrefix}/**`]: { proxy: "/**" },
        },
      }

      if (isVercelPreset(buildPreset)) {
        nitroConfig = withVercelOutputAPI(nitroConfig, workspaceRoot)
      } else if (isCloudflarePreset(buildPreset)) {
        nitroConfig = withCloudflareOutput(nitroConfig)
      }

      const clientOutputPath = resolve(
        workspaceRoot,
        rootDir,
        config.build?.outDir || "dist",
      )

      if (isBuild) {
        nitroConfig.publicAssets = [{ dir: clientOutputPath }]
      }

      nitroConfig = mergeConfig(
        nitroConfig,
        nitroOptions as Record<string, any>,
      )
    },
    async configureServer(viteServer: ViteDevServer) {
      if (isServe) {
        const nitro = await createNitro({
          dev: true,
          ...nitroConfig,
        })
        const server = createDevServer(nitro)
        await build(nitro)

        viteServer.middlewares.use(
          apiPrefix,
          toNodeListener(server.app as unknown as App),
        )

        viteServer.httpServer?.once("listening", () => {
          const { host, port } = viteServer.config.server
          process.env.NITRO_HOST = host ? String(host) : "localhost"
          process.env.NITRO_PORT = String(port)
        })

        logger.info(`The server endpoints are accessible under the "${apiPrefix}" path.`)
      }
    },
    async closeBundle() {
      if (isBuild) {
        await buildServer(nitroConfig)
        logger.success(`The server has been successfully built.`)
      }
    },
  }
}
