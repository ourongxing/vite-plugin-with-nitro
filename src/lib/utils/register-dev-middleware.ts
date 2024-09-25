import type { ViteDevServer } from "vite"
import type { EventHandler } from "h3"
import { createEvent } from "h3"
import fg from "fast-glob"

export async function registerDevServerMiddleware(root: string, viteServer: ViteDevServer): Promise<void> {
  const middlewareFiles = fg.sync([`${root}/src/server/middleware/**/*.ts`])

  middlewareFiles.forEach((file) => {
    viteServer.middlewares.use(async (req, res, next) => {
      const middlewareHandler: EventHandler = await viteServer
        .ssrLoadModule(file)
        .then((m: unknown) => (m as { default: EventHandler }).default)

      const result = await middlewareHandler(createEvent(req, res))

      if (!result) {
        next()
      }
    })
  })
}
