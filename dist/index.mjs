import { createNitro, prepare, copyPublicAssets, prerender, build, createDevServer } from 'nitropack';
import { createEvent, sendWebResponse, toNodeListener } from 'h3';
import { mergeConfig, build as build$1, normalizePath } from 'vite';
import { relative, resolve, join, dirname } from 'node:path';
import { platform } from 'node:os';
import { fileURLToPath } from 'node:url';
import { existsSync, unlinkSync, writeFileSync, readFileSync } from 'node:fs';
import { buildSync } from 'esbuild';
import fg from 'fast-glob';
import { create } from 'xmlbuilder2';
import { createRequire } from 'node:module';

function addPostRenderingHooks(nitro, hooks) {
  hooks.forEach((hook) => {
    nitro.hooks.hook("prerender:generate", (route) => {
      hook(route);
    });
  });
}

async function buildServer(options, nitroConfig) {
  const nitro = await createNitro({
    dev: false,
    preset: process.env["BUILD_PRESET"],
    ...nitroConfig
  });
  if (options?.prerender?.postRenderingHooks) {
    addPostRenderingHooks(nitro, options.prerender.postRenderingHooks);
  }
  await prepare(nitro);
  await copyPublicAssets(nitro);
  if (options?.ssr && nitroConfig?.prerender?.routes && nitroConfig?.prerender?.routes.find((route) => route === "/")) {
    if (existsSync(`${nitroConfig?.output?.publicDir}/index.html`)) {
      unlinkSync(`${nitroConfig?.output?.publicDir}/index.html`);
    }
  }
  if (nitroConfig?.prerender?.routes && nitroConfig?.prerender?.routes?.length > 0) {
    console.log(`Prerendering static pages...`);
    await prerender(nitro);
  }
  if (!options?.static) {
    console.log("Building Server...");
    await build(nitro);
  }
  await nitro.close();
}

async function buildSSRApp(config, options) {
  const workspaceRoot = options?.workspaceRoot ?? process.cwd();
  const rootDir = relative(workspaceRoot, config.root || ".") || ".";
  const ssrBuildConfig = mergeConfig(config, {
    build: {
      ssr: true,
      rollupOptions: {
        input: options?.entryServer || resolve(workspaceRoot, rootDir, "src/main.server.ts")
      },
      outDir: options?.ssrBuildDir || resolve(workspaceRoot, "dist", rootDir, "ssr")
    }
  });
  await build$1(ssrBuildConfig);
}

function pageEndpointsPlugin() {
  return {
    name: "analogjs-vite-plugin-nitro-rollup-page-endpoint",
    async transform(_code, id) {
      if (normalizePath(id).includes("/pages/") && id.endsWith(".server.ts")) {
        const compiled = buildSync({
          stdin: {
            contents: _code,
            sourcefile: id,
            loader: "ts"
          },
          write: false,
          metafile: true,
          platform: "neutral",
          format: "esm",
          logLevel: "silent"
        });
        let fileExports = [];
        for (let key in compiled.metafile?.outputs) {
          if (compiled.metafile?.outputs[key].entryPoint) {
            fileExports = compiled.metafile?.outputs[key].exports;
          }
        }
        const code = `
            import { defineEventHandler } from 'h3';

            ${fileExports.includes("load") ? _code : `
                ${_code}
                export const load = () => {
                  return {};
                }`}

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
                console.error(\` An error occurred: \${e}\`)
                throw e;
              }
            });
          `;
        return {
          code,
          map: null
        };
      }
      return;
    }
  };
}

function getPageHandlers({
  workspaceRoot,
  rootDir,
  additionalPagesDirs
}) {
  const root = normalizePath(resolve(workspaceRoot, rootDir));
  const endpointFiles = fg.sync(
    [
      `${root}/src/app/pages/**/*.server.ts`,
      ...(additionalPagesDirs || []).map(
        (dir) => `${workspaceRoot}${dir}/**/*.server.ts`
      )
    ],
    { dot: true }
  );
  const handlers = endpointFiles.map((endpointFile) => {
    const route = endpointFile.replace(/^(.*?)\/pages/, "/pages").replace(/\.server\.ts$/, "").replace(/\[\.{3}(.+)\]/g, "**:$1").replace(/\[\.{3}(\w+)\]/g, "**:$1").replace(/\/\((.*?)\)$/, "/-$1-").replace(/\[(\w+)\]/g, ":$1").replace(/\./g, "/");
    return {
      handler: endpointFile,
      route: `/_analog${route}`,
      lazy: true
    };
  });
  return handlers;
}

async function buildSitemap(config, sitemapConfig, routes, outputDir) {
  const routeList = await optionHasRoutes(routes);
  if (routeList.length) {
    const slash = checkSlash(sitemapConfig.host);
    const sitemapData = routeList.map((page) => ({
      page: `${sitemapConfig.host}${slash}${page.replace(/^\/+/g, "")}`,
      lastMod: (/* @__PURE__ */ new Date()).toISOString().split("T")[0]
    }));
    const sitemap = createXml("urlset");
    for (const item of sitemapData) {
      const page = sitemap.ele("url");
      page.ele("loc").txt(item.page);
      page.ele("lastmod").txt(item.lastMod);
    }
    const mapPath = `${resolve(outputDir)}/sitemap.xml`;
    try {
      console.log(`Writing sitemap at ${mapPath}`);
      writeFileSync(mapPath, sitemap.end({ prettyPrint: true }));
    } catch (e) {
      console.error(`Unable to write file at ${mapPath}`, e);
    }
  }
}
function createXml(elementName) {
  return create({ version: "1.0", encoding: "UTF-8" }).ele(elementName, {
    xmlns: "https://www.sitemaps.org/schemas/sitemap/0.9"
  }).com(`This file was automatically generated by Analog.`);
}
function checkSlash(host) {
  const finalChar = host.slice(-1);
  return finalChar === "/" ? "" : "/";
}
async function optionHasRoutes(routes) {
  let routeList;
  if (typeof routes === "function") {
    routeList = await routes();
  } else if (Array.isArray(routes)) {
    routeList = routes;
  } else {
    routeList = [];
  }
  return routeList.filter(Boolean);
}

async function registerDevServerMiddleware(root, viteServer) {
  const middlewareFiles = fg.sync([`${root}/src/server/middleware/**/*.ts`]);
  middlewareFiles.forEach((file) => {
    viteServer.middlewares.use(async (req, res, next) => {
      const middlewareHandler = await viteServer.ssrLoadModule(file).then((m) => m.default);
      const result = await middlewareHandler(createEvent(req, res));
      if (!result) {
        next();
      }
    });
  });
}

function devServerPlugin(options) {
  const workspaceRoot = options?.workspaceRoot || process.cwd();
  const entryServer = options.entryServer || "src/main.server.ts";
  const index = options.index || "index.html";
  let config;
  let root;
  return {
    name: "analogjs-dev-ssr-plugin",
    config(userConfig) {
      config = userConfig;
      root = normalizePath(resolve(workspaceRoot, config.root || ".") || ".");
      return {
        resolve: {
          alias: {
            "~analog/entry-server": entryServer
          }
        }
      };
    },
    configureServer(viteServer) {
      return async () => {
        remove_html_middlewares(viteServer.middlewares);
        registerDevServerMiddleware(root, viteServer);
        viteServer.middlewares.use(async (req, res) => {
          let template = readFileSync(
            resolve(viteServer.config.root, index),
            "utf-8"
          );
          template = await viteServer.transformIndexHtml(
            req.originalUrl,
            template
          );
          try {
            const entryServer2 = (await viteServer.ssrLoadModule("~analog/entry-server"))["default"];
            const result = await entryServer2(
              req.originalUrl,
              template,
              {
                req,
                res
              }
            );
            if (result instanceof Response) {
              sendWebResponse(createEvent(req, res), result);
              return;
            }
            res.setHeader("Content-Type", "text/html");
            res.end(result);
          } catch (e) {
            viteServer && viteServer.ssrFixStacktrace(e);
            res.statusCode = 500;
            res.end(`
              <!DOCTYPE html>
              <html lang="en">
                <head>
                  <meta charset="UTF-8" />
                  <title>Error</title>
                  <script type="module">
                    import { ErrorOverlay } from '/@vite/client'
                    document.body.appendChild(new ErrorOverlay(${JSON.stringify(
              prepareError(req, e)
            ).replace(/</g, "\\u003c")}))
                  <\/script>
                </head>
                <body>
                </body>
              </html>
            `);
          }
        });
      };
    }
  };
}
function remove_html_middlewares(server) {
  const html_middlewares = [
    "viteIndexHtmlMiddleware",
    "vite404Middleware",
    "viteSpaFallbackMiddleware"
  ];
  for (let i = server.stack.length - 1; i > 0; i--) {
    if (html_middlewares.includes(server.stack[i].handle.name)) {
      server.stack.splice(i, 1);
    }
  }
}
function prepareError(req, error) {
  const e = error;
  return {
    message: `An error occured while server rendering ${req.url}:

	${typeof e === "string" ? e : e.message} `,
    stack: typeof e === "string" ? "" : e.stack
  };
}

const require = createRequire(import.meta.url);
function getMatchingContentFilesWithFrontMatter(workspaceRoot, rootDir, glob) {
  const fg = require("fast-glob");
  const fm = require("front-matter");
  const root = normalizePath(resolve(workspaceRoot, rootDir));
  const resolvedDir = normalizePath(relative(root, join(root, glob)));
  const contentFiles = fg.sync([`${root}/${resolvedDir}/*`], {
    dot: true
  });
  const mappedFilesWithFm = contentFiles.map((f) => {
    const fileContents = readFileSync(f, "utf8");
    const raw = fm(fileContents);
    const filepath = f.replace(root, "");
    const match = filepath.match(/\/([^/.]+)(\.([^/.]+))?$/);
    let name = "";
    let extension = "";
    if (match) {
      name = match[1];
      extension = match[3] || "";
    }
    return {
      name,
      extension,
      path: resolvedDir,
      attributes: raw.attributes
    };
  });
  return mappedFilesWithFm;
}

const isWindows = platform() === "win32";
const filePrefix = isWindows ? "file:///" : "";
let clientOutputPath = "";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
function nitro(options, nitroOptions) {
  const workspaceRoot = options?.workspaceRoot ?? process.cwd();
  const isTest = process.env["NODE_ENV"] === "test" || !!process.env["VITEST"];
  const apiPrefix = `/${nitroOptions?.runtimeConfig?.["apiPrefix"] ?? "api"}`;
  let isBuild = false;
  let isServe = false;
  let ssrBuild = false;
  let config;
  let nitroConfig;
  return [
    options?.ssr ? devServerPlugin(options) : false,
    {
      name: "@analogjs/vite-plugin-nitro",
      async config(_config, { command }) {
        isServe = command === "serve";
        isBuild = command === "build";
        ssrBuild = _config.build?.ssr === true;
        config = _config;
        const rootDir = relative(workspaceRoot, config.root || ".") || ".";
        const buildPreset = process.env["BUILD_PRESET"] ?? nitroOptions?.preset;
        const pageHandlers = getPageHandlers({
          workspaceRoot,
          rootDir,
          additionalPagesDirs: options?.additionalPagesDirs
        });
        const apiMiddlewareHandler = filePrefix + normalizePath(
          join(__dirname, `runtime/api-middleware${filePrefix ? ".mjs" : ""}`)
        );
        const ssrEntry = normalizePath(
          filePrefix + resolve(
            workspaceRoot,
            "dist",
            rootDir,
            `ssr/main.server${filePrefix ? ".js" : ""}`
          )
        );
        const rendererEntry = filePrefix + normalizePath(
          join(
            __dirname,
            `runtime/renderer${!options?.ssr ? "-client" : ""}${filePrefix ? ".mjs" : ""}`
          )
        );
        nitroConfig = {
          rootDir,
          preset: buildPreset,
          logLevel: nitroOptions?.logLevel || 0,
          srcDir: normalizePath(`${rootDir}/src/server`),
          scanDirs: [
            normalizePath(`${rootDir}/src/server`),
            ...(options?.additionalAPIDirs || []).map(
              (dir) => normalizePath(`${workspaceRoot}${dir}`)
            )
          ],
          output: {
            dir: normalizePath(
              resolve(workspaceRoot, "dist", rootDir, "analog")
            ),
            publicDir: normalizePath(
              resolve(workspaceRoot, "dist", rootDir, "analog/public")
            )
          },
          buildDir: normalizePath(
            resolve(workspaceRoot, "dist", rootDir, ".nitro")
          ),
          typescript: {
            generateTsConfig: false
          },
          rollupConfig: {
            onwarn(warning) {
              if (warning.message.includes("empty chunk") && warning.message.endsWith(".server")) {
                return;
              }
            },
            plugins: [pageEndpointsPlugin()]
          },
          handlers: [
            {
              handler: apiMiddlewareHandler,
              middleware: true
            },
            ...pageHandlers
          ]
        };
        if (isVercelPreset(buildPreset)) {
          nitroConfig = withVercelOutputAPI(nitroConfig, workspaceRoot);
        }
        if (isCloudflarePreset(buildPreset)) {
          nitroConfig = withCloudflareOutput(nitroConfig);
        }
        if (!ssrBuild && !isTest) {
          clientOutputPath = resolve(
            workspaceRoot,
            rootDir,
            config.build?.outDir || "dist/client"
          );
        }
        const indexEntry = normalizePath(
          resolve(clientOutputPath, "index.html")
        );
        nitroConfig.alias = {
          "#analog/ssr": ssrEntry,
          "#analog/index": indexEntry
        };
        if (isBuild) {
          nitroConfig.publicAssets = [{ dir: clientOutputPath }];
          nitroConfig.serverAssets = [
            {
              baseName: "public",
              dir: clientOutputPath
            }
          ];
          nitroConfig.renderer = rendererEntry;
          if (isEmptyPrerenderRoutes(options)) {
            nitroConfig.prerender = {};
            nitroConfig.prerender.routes = ["/"];
          }
          if (options?.prerender) {
            nitroConfig.prerender = nitroConfig.prerender ?? {};
            nitroConfig.prerender.crawlLinks = options?.prerender?.discover;
            let routes = [];
            const prerenderRoutes = options?.prerender?.routes;
            if (isArrayWithElements(prerenderRoutes)) {
              routes = prerenderRoutes;
            } else if (typeof prerenderRoutes === "function") {
              routes = await prerenderRoutes();
            }
            nitroConfig.prerender.routes = routes.reduce(
              (prev, current) => {
                if (!current) {
                  return prev;
                }
                if (typeof current === "string") {
                  prev.push(current);
                  return prev;
                }
                const affectedFiles = getMatchingContentFilesWithFrontMatter(
                  workspaceRoot,
                  rootDir,
                  current.contentDir
                );
                affectedFiles.forEach((f) => {
                  const result = current.transform(f);
                  if (result) {
                    prev.push(result);
                  }
                });
                return prev;
              },
              []
            );
          }
          if (ssrBuild) {
            if (isWindows) {
              const indexContents = readFileSync(
                normalizePath(join(clientOutputPath, "index.html")),
                "utf-8"
              );
              writeFileSync(
                normalizePath(rendererEntry.replace(filePrefix, "")),
                `
              /**
               * This file is shipped as ESM for Windows support,
               * as it won't resolve the renderer.ts file correctly in node.
               */
              import { eventHandler } from 'h3';

              // @ts-ignore
              import renderer from '${ssrEntry}';
              // @ts-ignore
              const template = \`${indexContents}\`;

              export default eventHandler(async (event) => {
                const html = await renderer(event.node.req.url, template, {
                  req: event.node.req,
                  res: event.node.res,
                });
                return html;
              });
              `
              );
            }
            nitroConfig = {
              ...nitroConfig,
              externals: {
                external: ["rxjs", "node-fetch-native/dist/polyfill"]
              },
              moduleSideEffects: ["zone.js/node", "zone.js/fesm2015/zone-node"],
              handlers: [
                {
                  handler: apiMiddlewareHandler,
                  middleware: true
                },
                ...pageHandlers
              ]
            };
          }
        }
        nitroConfig = mergeConfig(
          nitroConfig,
          nitroOptions
        );
      },
      async configureServer(viteServer) {
        if (isServe && !isTest) {
          const nitro2 = await createNitro({
            dev: true,
            ...nitroConfig
          });
          const server = createDevServer(nitro2);
          await build(nitro2);
          viteServer.middlewares.use(
            apiPrefix,
            toNodeListener(server.app)
          );
          viteServer.httpServer?.once("listening", () => {
            process.env["ANALOG_HOST"] = !viteServer.config.server.host ? "localhost" : viteServer.config.server.host;
            process.env["ANALOG_PORT"] = `${viteServer.config.server.port}`;
          });
          console.log(
            `

The server endpoints are accessible under the "${apiPrefix}" path.`
          );
        }
      },
      async closeBundle() {
        if (ssrBuild) {
          return;
        }
        if (isBuild) {
          if (options?.ssr) {
            console.log("Building SSR application...");
            await buildSSRApp(config, options);
          }
          if (nitroConfig.prerender?.routes?.length && options?.prerender?.sitemap) {
            console.log("Building Sitemap...");
            await buildSitemap(
              config,
              options.prerender.sitemap,
              nitroConfig.prerender.routes,
              clientOutputPath
            );
          }
          await buildServer(options, nitroConfig);
          console.log(
            `

The '@analogjs/platform' server has been successfully built.`
          );
        }
      }
    }
  ];
}
function isEmptyPrerenderRoutes(options) {
  if (!options || isArrayWithElements(options?.prerender?.routes)) {
    return false;
  }
  return !options.prerender?.routes;
}
function isArrayWithElements(arr) {
  return !!(Array.isArray(arr) && arr.length);
}
const isVercelPreset = (buildPreset) => process.env["VERCEL"] || buildPreset && buildPreset.toLowerCase().includes("vercel");
const withVercelOutputAPI = (nitroConfig, workspaceRoot) => ({
  ...nitroConfig,
  output: {
    ...nitroConfig?.output,
    dir: normalizePath(resolve(workspaceRoot, ".vercel", "output")),
    publicDir: normalizePath(
      resolve(workspaceRoot, ".vercel", "output/static")
    )
  }
});
const isCloudflarePreset = (buildPreset) => process.env["CF_PAGES"] || buildPreset && buildPreset.toLowerCase().includes("cloudflare-pages");
const withCloudflareOutput = (nitroConfig) => ({
  ...nitroConfig,
  output: {
    ...nitroConfig?.output,
    serverDir: "{{ output.publicDir }}/_worker.js"
  }
});

export { nitro as default };
