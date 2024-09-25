import { relative, resolve } from "node:path"
import process from "node:process"
import type { UserConfig } from "vite"
import { build, mergeConfig } from "vite"

import type { Options } from "./options.js"

export async function buildSSRApp(config: UserConfig, options?: Options): Promise<void> {
  const workspaceRoot = options?.workspaceRoot ?? process.cwd()
  const rootDir = relative(workspaceRoot, config.root || ".") || "."
  const ssrBuildConfig = mergeConfig(config, {
    build: {
      ssr: true,
      rollupOptions: {
        input:
          options?.entryServer
          || resolve(workspaceRoot, rootDir, "src/main.server.ts"),
      },
      outDir:
        options?.ssrBuildDir || resolve(workspaceRoot, "dist", rootDir, "ssr"),
    },
  })

  await build(ssrBuildConfig)
}
