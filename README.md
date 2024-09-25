# vite-plugin-with-nitro

A Vite plugin for integrating with [Nitro](https://nitro.unjs.io). Forked from `@analogjs/vite-plugin-nitro`.

## Install

```shell
pnpm add vite-plugin-with-nitro -S
```

## Setup

Add the plugin to the `plugins` array in your Vite config

```ts
import { defineConfig } from "vite"
import nitro from "vite-plugin-with-nitro"

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [nitro()],
})
```
