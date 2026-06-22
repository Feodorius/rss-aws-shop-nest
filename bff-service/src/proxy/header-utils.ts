import type { IncomingHttpHeaders } from 'http';

/**
 * Hop-by-hop headers per RFC 7230 §6.1 plus a few that we recompute on each
 * leg of the proxy chain. Forwarding these would break the connection
 * downstream (e.g. stale `content-length`) or leak the wrong host
 * (`host` would point at the BFF, not at the API Gateway).
 */
export const HOP_BY_HOP_HEADERS = new Set<string>([
  'host',
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
  'content-length',
]);

/**
 * CORS response headers — the BFF sets its own via `enableCors`, so we must
 * strip any that the upstream service emits, otherwise the browser sees
 * duplicated values and rejects the response.
 */
export const CORS_RESPONSE_HEADERS = new Set<string>([
  'access-control-allow-origin',
  'access-control-allow-credentials',
  'access-control-allow-headers',
  'access-control-allow-methods',
  'access-control-expose-headers',
  'access-control-max-age',
]);

/**
 * Copy an incoming request's headers, dropping anything in the skip set.
 * Header names are normalized to lowercase so downstream lookups are stable.
 */
export function copyRequestHeaders(
  source: IncomingHttpHeaders,
  skip: Set<string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(source)) {
    if (value === undefined) continue;
    const lower = name.toLowerCase();
    if (skip.has(lower)) continue;
    out[lower] = Array.isArray(value) ? value.join(', ') : String(value);
  }
  return out;
}

/**
 * Pick a forwardable subset of an upstream response's headers — drop
 * hop-by-hop entries and CORS headers (we re-emit our own).
 */
export function pickResponseHeaders(
  source: Record<string, string | string[] | undefined>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(source)) {
    if (value === undefined) continue;
    const lower = name.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(lower)) continue;
    if (CORS_RESPONSE_HEADERS.has(lower)) continue;
    out[lower] = Array.isArray(value) ? value.join(', ') : String(value);
  }
  return out;
}
