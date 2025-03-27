export default defineEventHandler(async (event) => {
  const url =  getQuery(event).url
  if (!url) throw createError({ statusCode: 400, statusMessage: "Missing url" });
  const last = Date.now()
  const cookie = (await $fetch.raw(url)).headers.getSetCookie()
  return {
    status: "ok",
    time: Date.now() - last,
    cookie
  };
});