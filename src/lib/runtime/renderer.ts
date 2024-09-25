// @ts-nocheck
import { eventHandler } from "h3"

import renderer from "#analog/ssr"
import template from "#analog/index"

export default eventHandler(async (event) => {
  const html = await renderer(event.node.req.url, template, {
    req: event.node.req,
    res: event.node.res,
  })
  return html
})
