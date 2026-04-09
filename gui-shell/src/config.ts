const DEFAULT_API_BASE_URL = "http://127.0.0.1:8008";

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

const envOverride = import.meta.env.VITE_API_BASE_URL?.trim();

/** Same-origin in dev (Vite proxy → gui-bridge); full URL in production builds. */
const resolvedBase =
  envOverride ||
  (import.meta.env.DEV ? "" : DEFAULT_API_BASE_URL);

export const API_BASE_URL = trimTrailingSlash(resolvedBase);
