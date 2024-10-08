// SSR dev server, middleware and error page source modified from
// https://github.com/solidjs/solid-start/blob/main/packages/start/dev/server.js

import { resolve } from "node:path"
import { readFileSync } from "node:fs"
import process from "node:process"
import type {
  Connect,
  Plugin,
  UserConfig,
  ViteDevServer,
} from "vite"
import { normalizePath } from "vite"
import { createEvent, sendWebResponse } from "h3"

import { registerDevServerMiddleware } from "../utils/register-dev-middleware.js"
import type { Options } from "../options.js"

export function devServerPlugin(options: Options): Plugin {
  const workspaceRoot = options?.workspaceRoot || process.cwd()
  const entryServer = options.entryServer || "src/main.server.ts"
  const index = options.index || "index.html"
  let config: UserConfig
  let root: string

  return {
    name: "dev-ssr-plugin",
    config(userConfig) {
      config = userConfig
      root = normalizePath(resolve(workspaceRoot, config.root || ".") || ".")

      return {
        resolve: {
          alias: {
            "#nitro/entry-server": entryServer,
          },
        },
      }
    },
    configureServer(viteServer) {
      return async () => {
        remove_html_middlewares(viteServer.middlewares)
        registerDevServerMiddleware(root, viteServer)

        viteServer.middlewares.use(async (req, res) => {
          let template = readFileSync(
            resolve(viteServer.config.root, index),
            "utf-8",
          )

          template = await viteServer.transformIndexHtml(
            req.originalUrl as string,
            template,
          )

          try {
            const entryServer = (
              await viteServer.ssrLoadModule("#nitro/entry-server")
            ).default
            const result: string | Response = await entryServer(
              req.originalUrl,
              template,
              {
                req,
                res,
              },
            )

            if (result instanceof Response) {
              sendWebResponse(createEvent(req, res), result)
              return
            }

            res.setHeader("Content-Type", "text/html")
            res.end(result)
          } catch (e) {
            if (viteServer) viteServer.ssrFixStacktrace(e as Error)
            res.statusCode = 500
            res.end(`
              <!DOCTYPE html>
              <html lang="en">
                <head>
                  <meta charset="UTF-8" />
                  <title>Error</title>
                  <script type="module">
                    import { ErrorOverlay } from '/@vite/client'
                    document.body.appendChild(new ErrorOverlay(${JSON.stringify(
    prepareError(req, e),
  ).replace(/</g, "\\u003c")}))
                  </script>
                </head>
                <body>
                </body>
              </html>
            `)
          }
        })
      }
    },
  }
}

/**
 * Removes Vite internal middleware
 *
 * @param server
 */
function remove_html_middlewares(server: ViteDevServer["middlewares"]): void {
  const html_middlewares = [
    "viteIndexHtmlMiddleware",
    "vite404Middleware",
    "viteSpaFallbackMiddleware",
  ]
  for (let i = server.stack.length - 1; i > 0; i--) {
    // @ts-expect-error TODO
    if (html_middlewares.includes(server.stack[i].handle.name)) {
      server.stack.splice(i, 1)
    }
  }
}

/**
 * Formats error for SSR message in error overlay
 * @param req
 * @param error
 */
function prepareError(req: Connect.IncomingMessage, error: unknown): any {
  const e = error as Error
  return {
    message: `An error occured while server rendering ${req.url}:\n\n\t${
      typeof e === "string" ? e : e.message
    } `,
    stack: typeof e === "string" ? "" : e.stack,
  }
}
