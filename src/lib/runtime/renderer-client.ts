// @ts-nocheck

import { eventHandler } from "h3"

import template from "#nitro/index"

export default eventHandler(async () => {
  return template
})
