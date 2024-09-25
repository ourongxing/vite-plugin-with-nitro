import * as fs from "node:fs"
import { buildSitemap } from "./build-sitemap"

describe("build sitemap", () => {
  const config = { root: "root" }
  const sitemapConfig = { host: "http://host.com" }

  beforeEach(() => {
    vi.mock("fs")
  })

  it("should not perform functionality if no predefined routes are present", () => {
    const spy = vi.spyOn(fs, "writeFileSync")
    buildSitemap(config, sitemapConfig, [], "")

    expect(spy).not.toHaveBeenCalled()
  })
})
