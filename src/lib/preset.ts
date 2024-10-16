import { resolve } from "node:path"
import type { NitroConfig } from "nitropack/config"
import { normalizePath } from "vite"
import type { PresetNameInput } from "nitropack/presets"

export function withPreset(preset: PresetNameInput, workspaceRoot: string): NitroConfig {
  if (preset.includes("vercel")) {
    return {
      output: {
        dir: normalizePath(resolve(workspaceRoot, ".vercel", "output")),
        publicDir: normalizePath(
          resolve(workspaceRoot, ".vercel", "output/static"),
        ),
      },
    }
  } else if (preset.includes("cloudflare")) {
    return {
      cloudflare: {
        pages: {
          routes: {
            include: ["/api/*"],
          },
        },
      },
      output: {
        serverDir: "{{ output.publicDir }}/_worker.js",
      },
    }
  } else {
    return {}
  }
}
