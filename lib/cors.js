// Browser origins allowed to read this API.
// The running Render service sends these headers only after the owner merges this branch and redeploys.
// This module does not deploy anything.

export const PAGES_ORIGIN = 'https://dryrun-near.pages.dev';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export function isAllowedOrigin(origin) {
  if (typeof origin !== 'string' || origin.length === 0 || origin.length > 200) return false;
  if (origin === PAGES_ORIGIN) return true;
  let url;
  try { url = new URL(origin); } catch { return false; }
  if (url.origin !== origin || url.username || url.password) return false;
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  return LOCAL_HOSTS.has(url.hostname);
}

export function corsHeaders(origin) {
  const headers = { Vary: 'Origin' };
  if (!isAllowedOrigin(origin)) return headers;
  headers['Access-Control-Allow-Origin'] = origin;
  headers['Access-Control-Allow-Methods'] = 'GET, HEAD, POST, OPTIONS';
  headers['Access-Control-Allow-Headers'] = 'Content-Type';
  headers['Access-Control-Max-Age'] = '86400';
  return headers;
}
