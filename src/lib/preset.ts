import { resolve } from "node:path"
import process from "node:process"
import type { NitroConfig } from "nitropack"
import { normalizePath } from "vite"

export function isVercelPreset(buildPreset: string | undefined): boolean {
  return !!(process.env.VERCEL || (buildPreset && buildPreset.toLowerCase().includes("vercel")))
}

export function withVercelOutputAPI(nitroConfig: NitroConfig | undefined, workspaceRoot: string): NitroConfig {
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

export function isCloudflarePreset(buildPreset: string | undefined): boolean {
  return !!(process.env.CF_PAGES || (buildPreset && buildPreset.toLowerCase().includes("cloudflare-pages")))
}

export function withCloudflareOutput(nitroConfig: NitroConfig | undefined): NitroConfig {
  return {
    ...nitroConfig,
    output: {
      ...nitroConfig?.output,
      serverDir: "{{ output.publicDir }}/_worker.js",
    },
  }
}
