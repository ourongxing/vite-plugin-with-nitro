import { type ConsolaInstance, createConsola } from "consola"

export const logger: ConsolaInstance = createConsola({
  level: 4,
  formatOptions: {
    columns: 80,
    colors: true,
    compact: false,
    date: false,
  },
})
