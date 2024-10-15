import process from "node:process"
import type { NitroConfig } from "nitropack"
import { build, copyPublicAssets, createNitro, prepare, prerender } from "nitropack"

import { logger } from "../logger.js"
import type { Options } from "./options.js"
import { addPostRenderingHooks } from "./hooks/post-rendering-hook.js"

export async function buildServer(
  options?: Options,
  nitroConfig?: NitroConfig,
): Promise<void> {
  const nitro = await createNitro({
    dev: false,
    preset: process.env.BUILD_PRESET,
    ...nitroConfig,
  })

  if (options?.prerender?.postRenderingHooks) {
    addPostRenderingHooks(nitro, options.prerender.postRenderingHooks)
  }

  await prepare(nitro)
  await copyPublicAssets(nitro)

  if (
    nitroConfig?.prerender?.routes
    && nitroConfig?.prerender?.routes?.length > 0
  ) {
    logger.start(`Prerendering static pages...`)
    await prerender(nitro)
  }

  if (!options?.static) {
    logger.start("Building Server...")
    await build(nitro)
  }

  await nitro.close()
}
