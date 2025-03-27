import { defineEventHandler, getQuery, sendProxy } from "h3"

export default defineEventHandler(async (event) => {
  const { url: encoded } = getQuery(event)
  if (encoded) {
    const url = decodeURIComponent(encoded as string)
    return sendProxy(event, url,
      {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Credentials": "*",
          "Access-Control-Allow-Methods": "GET, HEAD, POST, PUT, OPTIONS",
          "Access-Control-Allow-Headers": "*",
        }
      }
    )
  }
})
