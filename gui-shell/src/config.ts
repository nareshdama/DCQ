const DEFAULT_API_BASE_URL = "http://127.0.0.1:8008";

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

export const API_BASE_URL = trimTrailingSlash(
  import.meta.env.VITE_API_BASE_URL?.trim() || DEFAULT_API_BASE_URL
);
