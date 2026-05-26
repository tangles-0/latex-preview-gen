import { getYtdlpCookiesPath, getYtdlpJsRuntime } from "@/lib/env";

export const getYtdlpBaseArgs = () => [
  "--cookies",
  getYtdlpCookiesPath(),
  "--js-runtimes",
  getYtdlpJsRuntime(),
];
