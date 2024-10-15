import { defineBuildConfig } from "unbuild"

export default defineBuildConfig({
  entries: ["src/index", {
    builder: "mkdist",
    input: "./src/lib/runtime",
    outDir: "./dist/runtime",
  }],
  externals: ["vite"],
  clean: true,
  declaration: true,
  rollup: {
    emitCJS: true,
    inlineDependencies: true,
  },
})
