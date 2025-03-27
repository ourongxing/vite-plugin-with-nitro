import { defineEventHandler, getRequestURL } from "h3"
import { hello} from "../../test"

export default defineEventHandler(event => {
  const url = getRequestURL(event)

  return `Hello ${hello} ${url}!`
})