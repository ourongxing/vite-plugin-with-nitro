import { defineEventHandler } from "h3"
import { date } from "../../test"

export default defineEventHandler(()=> {
  return date
})