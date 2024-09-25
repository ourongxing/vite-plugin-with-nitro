import { buildSync } from "esbuild"
import type { Plugin } from "vite"
import { normalizePath } from "vite"

export function pageEndpointsPlugin(): Plugin {
  return {
    name: "analogjs-vite-plugin-nitro-rollup-page-endpoint",
    async transform(_code: string, id: string) {
      if (normalizePath(id).includes("/pages/") && id.endsWith(".server.ts")) {
        const compiled = buildSync({
          stdin: {
            contents: _code,
            sourcefile: id,
            loader: "ts",
          },
          write: false,
          metafile: true,
          platform: "neutral",
          format: "esm",
          logLevel: "silent",
        })

        let fileExports: string[] = []

        for (const key in compiled.metafile?.outputs) {
          if (compiled.metafile?.outputs[key].entryPoint) {
            fileExports = compiled.metafile?.outputs[key].exports
          }
        }

        const code = `
            import { defineEventHandler } from 'h3';

            ${
              fileExports.includes("load")
                ? _code
                : `
                ${_code}
                export const load = () => {
                  return {};
                }`
            }

            export default defineEventHandler(async(event) => {
              try {
                return await load({
                  params: event.context.params,
                  req: event.node.req,
                  res: event.node.res,
                  fetch: $fetch,
                  event
                });
              } catch(e) {
                console.error(\` An error occurred: \$\{e\}\`)
                throw e;
              }
            });
          `

        return {
          code,
          map: null,
        }
      }
    },
  }
}
