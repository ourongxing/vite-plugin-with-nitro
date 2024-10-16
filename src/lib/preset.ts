import { resolve } from "node:path"
import process from "node:process"
import type { NitroConfig } from "nitropack/config"
import { normalizePath } from "vite"

export function isVercelPreset(buildPreset: string | undefined): boolean {
  return !!(process.env.VERCEL || (buildPreset && buildPreset.toLowerCase().includes("vercel")))
}

export function withVercelOutputAPI(nitroConfig: NitroConfig | undefined, workspaceRoot: string): NitroConfig {
  return {
    ...nitroConfig,
    renderer: undefined,
    output: {
      ...nitroConfig?.output,
      dir: normalizePath(resolve(workspaceRoot, ".vercel", "output")),
      publicDir: normalizePath(
        resolve(workspaceRoot, ".vercel", "output/static"),
      ),
    },
    routeRules: {
      ...nitroConfig?.routeRules,
      // vercel 只能有自带的 route rule，nitro 会自动转换。
      // "/api/**": {
      //   headers: {
      //     "x-nitro-go": "true",
      //   },
      // },
      // "/**": {
      //   proxy: "/",
      // },
    },
  }
}

export function isCloudflarePreset(buildPreset: string | undefined): boolean {
  return !!(process.env.CF_PAGES || (buildPreset && buildPreset.toLowerCase().includes("cloudflare-pages")))
}

export function withCloudflareOutput(nitroConfig: NitroConfig | undefined): NitroConfig {
  return {
    ...nitroConfig,
    renderer: undefined,
    output: {
      ...nitroConfig?.output,
      serverDir: "{{ output.publicDir }}/_worker.js",
    },
    routeRules: {
      ...nitroConfig?.routeRules,
      "/**": {
        proxy: "/",
      },
    },
  }
}
