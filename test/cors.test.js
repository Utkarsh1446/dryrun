import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PAGES_ORIGIN, corsHeaders, isAllowedOrigin } from '../lib/cors.js';

process.env.DRYRUN_SCAN = '0';
process.env.DRYRUN_DATA = mkdtempSync(join(tmpdir(), 'dryrun-cors-'));

test('CORS allows the Pages origin and localhost dev, and rejects other origins', () => {
  const allowed = [
    PAGES_ORIGIN,
    'http://localhost:8787',
    'http://127.0.0.1:4173',
    'http://[::1]:8080',
    'https://localhost:3000',
  ];
  for (const origin of allowed) {
    assert.equal(isAllowedOrigin(origin), true, origin);
    assert.equal(corsHeaders(origin)['Access-Control-Allow-Origin'], origin, origin);
    assert.equal(corsHeaders(origin)['Access-Control-Allow-Headers'], 'Content-Type');
    assert.match(corsHeaders(origin)['Access-Control-Allow-Methods'], /\bPOST\b/);
    assert.equal(corsHeaders(origin).Vary, 'Origin');
  }
  const denied = [
    'https://evil.example',
    'https://dryrun-near.pages.dev.evil.com',
    'http://dryrun-near.pages.dev',
    'https://www.dryrun-near.pages.dev',
    'http://localhost.evil.com',
    'https://dryrun-pfgy.onrender.com',
    'null',
    '',
    'https://user:pass@localhost:8787',
  ];
  for (const origin of denied) {
    assert.equal(isAllowedOrigin(origin), false, origin);
    assert.equal(corsHeaders(origin)['Access-Control-Allow-Origin'], undefined, origin);
    assert.equal(corsHeaders(origin).Vary, 'Origin');
  }
  assert.equal(corsHeaders(undefined)['Access-Control-Allow-Origin'], undefined);
});

test('the API responds with CORS for Pages and localhost, including preflight', async () => {
  const { createApp } = await import('../server.js');
  const app = createApp();
  await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
  const { port } = app.address();
  const base = `http://127.0.0.1:${port}`;
  try {
    const page = await fetch(`${base}/api/meta`, { headers: { Origin: PAGES_ORIGIN } });
    assert.equal(page.status, 200);
    assert.equal(page.headers.get('access-control-allow-origin'), PAGES_ORIGIN);
    const body = await page.json();
    assert.equal(body.quoteMode, 'dry');

    const preflight = await fetch(`${base}/api/check`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:8787',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type',
      },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), 'http://localhost:8787');
    assert.match(preflight.headers.get('access-control-allow-headers'), /content-type/i);
    assert.match(preflight.headers.get('access-control-allow-methods'), /\bPOST\b/);

    const denied = await fetch(`${base}/api/meta`, { headers: { Origin: 'https://evil.example' } });
    assert.equal(denied.status, 200);
    assert.equal(denied.headers.get('access-control-allow-origin'), null);

    const missing = await fetch(`${base}/api/no-such`, { headers: { Origin: 'http://127.0.0.1:9999' } });
    assert.equal(missing.status, 404);
    assert.equal(missing.headers.get('access-control-allow-origin'), 'http://127.0.0.1:9999');
  } finally {
    await new Promise((resolve, reject) => app.close((error) => (error ? reject(error) : resolve())));
  }
});
