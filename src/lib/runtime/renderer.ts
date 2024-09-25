// @ts-nocheck
import { eventHandler } from "h3"

import renderer from "#nitro/ssr"
import template from "#nitro/index"

export default eventHandler(async (event) => {
  const html = await renderer(event.node.req.url, template, {
    req: event.node.req,
    res: event.node.res,
  })
  return html
})
