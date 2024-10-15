import { relative, resolve } from "node:path"
// import { fileURLToPath } from "node:url"
import process from "node:process"
import type { NitroConfig } from "nitropack"
import { build, createDevServer, createNitro } from "nitropack"
import type { App } from "h3"
import { toNodeListener } from "h3"
import type { Plugin, UserConfig, ViteDevServer } from "vite"
import { mergeConfig, normalizePath } from "vite"

import { logger } from "../logger"
import { buildServer } from "./build-server"
import type { Options } from "./options"
import { buildSitemap } from "./build-sitemap"

// const isWindows = platform() === "win32"
// const filePrefix = isWindows ? "file:///" : ""
let clientOutputPath = ""

// const __filename = fileURLToPath(import.meta.url)
// const __dirname = dirname(__filename)

export function nitro(options?: Options, nitroOptions?: NitroConfig): Plugin {
  const workspaceRoot = options?.workspaceRoot ?? process.cwd()
  const isTest = process.env.NODE_ENV === "test" || !!process.env.VITEST
  const apiPrefix = `/${nitroOptions?.runtimeConfig?.apiPrefix ?? "api"}`

  let isBuild = false
  let isServe = false
  const ssrBuild = false
  let config: UserConfig
  let nitroConfig: NitroConfig

  return {
    name: "vite-plugin-with-nitro",
    async config(_config, { command }) {
      isServe = command === "serve"
      isBuild = command === "build"
      config = _config
      const rootDir = relative(workspaceRoot, config.root || ".") || "."
      const buildPreset
          = process.env.BUILD_PRESET
          ?? (nitroOptions?.preset as string | undefined)

      // const apiMiddlewareHandler
      //     = filePrefix + normalizePath(join(__dirname, `runtime/api-middleware${filePrefix ? ".mjs" : ""}`))

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
        rollupConfig: {
          onwarn(_warning) {
            // TODO
            // if (
            //   warning.message.includes("empty chunk")
            //   && warning.message.endsWith(".server")
            // ) {

            // }
          },
          plugins: [],
        },
        routeRules: {
          "/api/**": { proxy: "/**" },
        },
        handlers: [
          // {
          //   handler: apiMiddlewareHandler,
          //   middleware: true,
          // },
        ],
      }

      if (isVercelPreset(buildPreset)) {
        nitroConfig = withVercelOutputAPI(nitroConfig, workspaceRoot)
      }

      if (isCloudflarePreset(buildPreset)) {
        nitroConfig = withCloudflareOutput(nitroConfig)
      }

      if (!ssrBuild && !isTest) {
        // store the client output path for the SSR build config
        clientOutputPath = resolve(
          workspaceRoot,
          rootDir,
          config.build?.outDir || "dist",
        )
      }

      const indexEntry = normalizePath(
        resolve(clientOutputPath, "index.html"),
      )

      nitroConfig.alias = {
        "#nitro/index": indexEntry,
      }

      if (isBuild) {
        nitroConfig.publicAssets = [{ dir: clientOutputPath }]
        // 导致体积飙升的罪魁祸首
        // nitroConfig.serverAssets = [
        //   {
        //     baseName: "public",
        //     dir: clientOutputPath,
        //   },
        // ]

        if (isEmptyPrerenderRoutes(options)) {
          nitroConfig.prerender = {}
          nitroConfig.prerender.routes = ["/"]
        }
      }

      // 合并 nitro config
      nitroConfig = mergeConfig(
        nitroConfig,
        nitroOptions as Record<string, any>,
      )
    },
    async configResolved() {
    },
    async configureServer(viteServer: ViteDevServer) {
      if (isServe && !isTest) {
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
        if (
          nitroConfig.prerender?.routes?.length
          && options?.prerender?.sitemap
        ) {
          logger.start("Building Sitemap...")
          // sitemap needs to be built after all directories are built
          await buildSitemap(
            config,
            options.prerender.sitemap,
            nitroConfig.prerender.routes,
            clientOutputPath,
          )
        }

        await buildServer(options, nitroConfig)

        logger.success(`The server has been successfully built.`)
      }
    },
  }
}

function isEmptyPrerenderRoutes(options?: Options): boolean {
  if (!options || isArrayWithElements(options?.prerender?.routes)) {
    return false
  }
  return !options.prerender?.routes
}

function isArrayWithElements<T>(arr: unknown): arr is [T, ...T[]] {
  return !!(Array.isArray(arr) && arr.length)
}

function isVercelPreset(buildPreset: string | undefined): boolean {
  return !!(process.env.VERCEL || (buildPreset && buildPreset.toLowerCase().includes("vercel")))
}

function withVercelOutputAPI(nitroConfig: NitroConfig | undefined, workspaceRoot: string): NitroConfig {
  return {
    ...nitroConfig,
    output: {
      ...nitroConfig?.output,
      dir: normalizePath(resolve(workspaceRoot, ".vercel", "output")),
      publicDir: normalizePath(
        resolve(workspaceRoot, ".vercel", "output/static"),
      ),
    },
  }
}

function isCloudflarePreset(buildPreset: string | undefined): boolean {
  return !!(process.env.CF_PAGES || (buildPreset && buildPreset.toLowerCase().includes("cloudflare-pages")))
}

function withCloudflareOutput(nitroConfig: NitroConfig | undefined): NitroConfig {
  return {
    ...nitroConfig,
    output: {
      ...nitroConfig?.output,
      serverDir: "{{ output.publicDir }}/_worker.js",
    },
  }
}
