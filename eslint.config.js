import { ourongxing } from "@ourongxing/eslint-config"

export default ourongxing({
  type: "lib",
  ignores: ["**/node_modules/**", "**/dist/**", "**/*.spec.*", "**/*.test.*", "src/lib/runtime/**"],
})
