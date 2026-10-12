/**
 * Resolves an API path against the configured backend daemon URL.
 * In dev mode, scripts/dev.ts injects NEXT_PUBLIC_API_URL (e.g. http://127.0.0.1:<port>).
 * In production SPA mode served directly by Fastify, relative paths are used.
 */
const API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "";

export function apiUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${normalized}`;
}
