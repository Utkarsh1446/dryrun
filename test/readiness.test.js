import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { AI_CRAWLERS, assertPublic, auditSite, createAuditor, parseRobots, privateIp, robotsAllows, siteUrlFrom } from '../lib/readiness.js';

function serve(handler) {
  return new Promise((resolve) => {
    const srv = createServer(handler);
    srv.listen(0, '127.0.0.1', () => resolve({ srv, base: `http://127.0.0.1:${srv.address().port}` }));
  });
}

const GOOD = `<!doctype html><html lang="en"><head><title>Ledgerly — invoices settled on NEAR</title>
<meta name="description" content="Ledgerly settles freelance invoices in USDC on NEAR with escrow and milestone release.">
<link rel="canonical" href="https://ledgerly.example/">
<meta property="og:title" content="Ledgerly"><meta property="og:description" content="Invoices on NEAR"><meta property="og:image" content="https://ledgerly.example/og.png">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization","name":"Ledgerly"},{"@type":"SoftwareApplication","name":"Ledgerly","offers":{"@type":"Offer","price":"5"}},{"@type":"FAQPage","mainEntity":[]}]}</script>
</head><body><h1>Ledgerly</h1><h2>How it works</h2><h2>Pricing</h2>
<p>${'Freelancers send an invoice, the client funds escrow, and the contract releases USDC when the milestone is approved. '.repeat(20)}</p>
<a href="/pricing">Pricing</a> <a href="/about">About</a> <a href="/contact">Contact</a> <img src="/a.png" alt="flow"></body></html>`;

const SPA = `<!doctype html><html><head><title>Vite + React</title></head><body><div id="root"></div><script type="module" src="/main.js"></script><a href="#">Home</a></body></html>`;

test('a well-built site passes every section', async () => {
  const { srv, base } = await serve((req, res) => {
    if (req.url === '/robots.txt') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end(`User-agent: *\nAllow: /\nSitemap: ${'https://ledgerly.example'}/sitemap.xml\n`); }
    if (req.url === '/llms.txt') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end('# Ledgerly\n> Invoices on NEAR.\n'); }
    if (req.url === '/sitemap.xml') { res.writeHead(200, { 'content-type': 'application/xml' }); return res.end('<?xml version="1.0"?><urlset><url><loc>https://ledgerly.example/</loc></url></urlset>'); }
    if (req.url === '/') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(GOOD); }
    res.writeHead(404); res.end('no');
  });
  try {
    const r = await auditSite(base + '/', { allowPrivate: true });
    const byId = Object.fromEntries(r.sections.map((s) => [s.id, s]));
    assert.equal(r.sections.length, 6);
    assert.equal(byId.crawlers.score, 100);
    assert.equal(byId.structured.score, 100);
    assert.equal(byId.files.score, 100);
    assert.equal(byId.metadata.score, 100);
    const https = byId.trust.checks.find((c) => c.id === 'https');
    assert.equal(https.status, 'fail', 'the fixture is plain http');
    assert.equal(byId.trust.checks.find((c) => c.id === 'pages').status, 'pass');
  } finally { srv.close(); }
});

test('an SPA shell: soft-404 files, scaffold title, no text, and a WAF that blocks GPTBot', async () => {
  const { srv, base } = await serve((req, res) => {
    if (/GPTBot/.test(req.headers['user-agent'] || '')) { res.writeHead(403, { 'content-type': 'text/html' }); return res.end('<title>Attention Required! | Cloudflare</title>'); }
    res.writeHead(200, { 'content-type': 'text/html', 'x-robots-tag': 'noindex' });
    res.end(SPA);
  });
  try {
    const r = await auditSite(base + '/', { allowPrivate: true });
    const get = (s, c) => r.sections.find((x) => x.id === s).checks.find((x) => x.id === c);
    assert.equal(get('files', 'llms').status, 'warn');
    assert.match(get('files', 'llms').detail, /soft 404/);
    assert.equal(get('files', 'sitemap').status, 'warn');
    assert.equal(get('files', 'soft404').status, 'warn');
    assert.equal(get('crawlers', 'robots').status, 'warn', 'an HTML robots.txt is treated as missing');
    assert.equal(get('crawlers', 'firewall').status, 'fail');
    assert.match(get('crawlers', 'firewall').detail, /GPTBot: HTTP 403/);
    assert.equal(get('crawlers', 'noindex').status, 'fail');
    assert.equal(get('metadata', 'title').status, 'fail');
    assert.match(get('metadata', 'title').detail, /Vite \+ React/);
    assert.equal(get('content', 'words').status, 'fail');
    assert.equal(get('content', 'links').status, 'fail');
    assert.ok(get('metadata', 'title').fix);
    assert.ok(r.score < 45, `score ${r.score}`);
  } finally { srv.close(); }
});

test('robots.txt: most specific group, longest rule, and the crawler list', () => {
  const p = parseRobots('User-agent: *\nAllow: /\n\nUser-agent: GPTBot\nUser-agent: CCBot\nDisallow: /\n\nUser-agent: ClaudeBot\nDisallow: /private\nAllow: /private/ok\nSitemap: https://a.b/s.xml');
  assert.equal(robotsAllows(p, 'GPTBot').allowed, false);
  assert.equal(robotsAllows(p, 'CCBot').allowed, false);
  assert.equal(robotsAllows(p, 'PerplexityBot').allowed, true);
  assert.equal(robotsAllows(p, 'ClaudeBot', '/private/x').allowed, false);
  assert.equal(robotsAllows(p, 'ClaudeBot', '/private/ok').allowed, true);
  assert.deepEqual(p.sitemaps, ['https://a.b/s.xml']);
  assert.equal(AI_CRAWLERS.length, 17);
});

test('SSRF guard refuses private, loopback, link-local and metadata targets', async () => {
  for (const ip of ['127.0.0.1', '10.0.0.5', '192.168.1.1', '172.20.0.1', '169.254.169.254', '100.64.0.1', '::1', 'fd00::1', '::ffff:127.0.0.1']) assert.equal(privateIp(ip), true, ip);
  assert.equal(privateIp('8.8.8.8'), false);
  await assert.rejects(assertPublic('http://127.0.0.1/'), /Private/);
  await assert.rejects(assertPublic('http://localhost:8080/'), /Private/);
  await assert.rejects(assertPublic('file:///etc/passwd'), /http/);
  await assert.rejects(assertPublic('http://evil.test/', { resolve: async () => [{ address: '10.1.2.3' }] }), /Private/);
  await assertPublic('https://ok.test/', { resolve: async () => [{ address: '93.184.216.34' }] });
});

test('the auditor refuses a private target before fetching it', async () => {
  const { srv, base } = await serve((req, res) => { res.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data' }); res.end(); });
  try {
    const audit = createAuditor({ fetchImpl: fetch, allowPrivate: false });
    const r = await audit(base + '/');
    assert.ok(r.error, 'loopback is refused without allowPrivate');
  } finally { srv.close(); }
});

test('audits are cached per URL', async () => {
  let hits = 0;
  const { srv, base } = await serve((req, res) => { if (req.url === '/') hits += 1; res.writeHead(200, { 'content-type': 'text/html' }); res.end(GOOD); });
  try {
    const audit = createAuditor({ allowPrivate: true });
    await audit(base + '/');
    const before = hits;
    const again = await audit(base + '/');
    assert.equal(again.cached, true);
    assert.equal(hits, before);
  } finally { srv.close(); }
});

test('site URL is picked from README links, skipping videos and explorers', () => {
  assert.equal(siteUrlFrom(['https://youtu.be/x', 'https://testnet.nearblocks.io/a', 'https://app.vercel.app']), 'https://app.vercel.app');
  assert.equal(siteUrlFrom(['https://youtu.be/x']), null);
  const readme = 'Connect a wallet such as [Meteor](https://meteorwallet.app).\nKeys at [cloud.near.ai](https://cloud.near.ai).\n\n**Live demo:** https://kheer.example.net/app\n';
  assert.equal(siteUrlFrom(readme), 'https://kheer.example.net/app');
  assert.equal(siteUrlFrom('Use [Meteor](https://meteorwallet.app) and see https://testnet.nearblocks.io/x'), null);
  assert.equal(siteUrlFrom('Built with Next.js. Deployed to https://foo.vercel.app.'), 'https://foo.vercel.app');
});
