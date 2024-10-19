import { defineEventHandler, getRequestURL } from "h3";

export default defineEventHandler((event) => {
  console.log(getRequestURL(event).pathname)
  return {
    name: "Vite Nitro Template",
  };
});