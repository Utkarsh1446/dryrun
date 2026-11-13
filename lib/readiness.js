// AI readiness audit of a live demo or website. Stdlib fetch only: no browser, no JS execution.
// SSRF-safe: every hop is resolved and private, loopback, link-local and metadata addresses are refused.
// Six sections, each a list of checks with pass/warn/fail and a fix line. Cached per URL.
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export const AI_CRAWLERS = [
  'GPTBot', 'OAI-SearchBot', 'ChatGPT-User',
  'ClaudeBot', 'Claude-User', 'Claude-SearchBot', 'anthropic-ai',
  'PerplexityBot', 'Perplexity-User',
  'Google-Extended', 'Applebot-Extended',
  'Bytespider', 'CCBot', 'Meta-ExternalAgent', 'Amazonbot', 'DuckAssistBot', 'cohere-ai',
];

// Published user-agent strings for the live firewall test.
export const FIREWALL_UAS = {
  'ChatGPT-User': 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot',
  GPTBot: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.1; +https://openai.com/gptbot',
  'OAI-SearchBot': 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot',
  ClaudeBot: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)',
  PerplexityBot: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)',
};
export const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

export const SCAFFOLD_TITLES = /^(vite \+ (react|vue|svelte|preact|lit|ts)( \+ ts)?|react app|create next app|create react app|vite app|next\.js app|sveltekit app|svelte app|vue app|nuxt app|my app|app|document|untitled|index|home|welcome to react|expo|astro|remix app|new app|hello world)$/i;

const MAX_BYTES = 1_500_000;
const TIMEOUT = 10_000;

// ---------- SSRF guard ----------
export function privateIp(ip) {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
      // 198.18.0.0/15 is reserved for benchmarking; some sandboxes use it for fake-IP DNS (opt-in only).
      || (a === 198 && (b === 18 || b === 19) && process.env.DRYRUN_ALLOW_FAKE_IP !== '1');
  }
  const v = ip.toLowerCase();
  if (v === '::' || v === '::1') return true;
  if (v.startsWith('::ffff:')) return privateIp(v.slice(7));
  return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v);
}

export async function assertPublic(url, { allowPrivate = false, resolve = lookup } = {}) {
  let u;
  try { u = new URL(url); } catch { throw Object.assign(new Error('Not a valid URL'), { status: 400 }); }
  if (!/^https?:$/.test(u.protocol)) throw Object.assign(new Error('Only http and https URLs are audited'), { status: 400 });
  if (u.username || u.password) throw Object.assign(new Error('URLs with credentials are refused'), { status: 400 });
  if (allowPrivate) return u;
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (/^(localhost|.*\.localhost|.*\.local|.*\.internal|metadata\.google\.internal)$/i.test(host)) throw Object.assign(new Error('Private hosts are refused'), { status: 400 });
  const addrs = isIP(host) ? [{ address: host }] : await resolve(host, { all: true }).catch(() => { throw Object.assign(new Error('Host does not resolve'), { status: 400 }); });
  if (!addrs.length || addrs.some((a) => privateIp(a.address))) throw Object.assign(new Error('Private or reserved addresses are refused'), { status: 400 });
  return u;
}

async function readCapped(res, maxBytes) {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks = [];
  let n = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.length;
    if (n > maxBytes) { chunks.push(value.slice(0, value.length - (n - maxBytes))); try { await reader.cancel(); } catch { /* ignore */ } break; }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8');
}

// GET with manual redirects (each hop re-checked), a timeout, and a byte cap.
export async function safeGet(url, { ua = BROWSER_UA, fetchImpl = fetch, allowPrivate = false, timeoutMs = TIMEOUT, maxBytes = MAX_BYTES, accept = 'text/html,application/xhtml+xml,*/*;q=0.8' } = {}) {
  const started = Date.now();
  let current = url;
  for (let hop = 0; hop < 6; hop++) {
    await assertPublic(current, { allowPrivate });
    let res;
    try {
      res = await fetchImpl(current, { redirect: 'manual', headers: { 'user-agent': ua, accept }, signal: AbortSignal.timeout(timeoutMs) });
    } catch (e) {
      return { error: e.name === 'TimeoutError' ? 'timed out' : 'could not connect', url: current, ms: Date.now() - started };
    }
    const ttfb = Date.now() - started;
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      try { await res.body?.cancel?.(); } catch { /* ignore */ }
      current = new URL(res.headers.get('location'), current).toString();
      continue;
    }
    const body = await readCapped(res, maxBytes).catch(() => '');
    return { status: res.status, headers: res.headers, type: res.headers.get('content-type') || '', body, url: current, ttfb, ms: Date.now() - started };
  }
  return { error: 'too many redirects', url: current, ms: Date.now() - started };
}

// ---------- robots.txt ----------
export function parseRobots(text) {
  const groups = [];
  let cur = null;
  let lastWasAgent = false;
  const sitemaps = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === 'user-agent') {
      if (!cur || !lastWasAgent) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
    } else if (key === 'allow' || key === 'disallow') {
      if (cur) cur.rules.push({ allow: key === 'allow', path: val });
      lastWasAgent = false;
    } else if (key === 'sitemap') sitemaps.push(val);
    else lastWasAgent = false;
  }
  return { groups, sitemaps };
}

function pathMatch(rule, path) {
  if (!rule) return false;
  const re = new RegExp('^' + rule.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));
  return re.test(path);
}

// RFC 9309: the most specific group for the agent, then the longest matching rule; Allow wins a tie.
export function robotsAllows(parsed, agent, path = '/') {
  const name = agent.toLowerCase();
  let group = parsed.groups.filter((g) => g.agents.some((a) => a !== '*' && name.includes(a)));
  if (!group.length) group = parsed.groups.filter((g) => g.agents.includes('*'));
  if (!group.length) return { allowed: true, source: 'no rule' };
  const rules = group.flatMap((g) => g.rules).filter((r) => r.path !== '' || !r.allow);
  let best = null;
  for (const r of rules) {
    if (r.path === '' ) continue; // "Disallow:" with no path allows everything
    if (!pathMatch(r.path, path)) continue;
    if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow)) best = r;
  }
  return { allowed: !best || best.allow, source: group[0].agents.includes('*') ? '*' : agent };
}

// ---------- HTML helpers ----------
const attr = (tag, name) => (tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i')) || [])[2] ?? (tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i')) || [])[3] ?? (tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i')) || [])[4] ?? null;
const metaTags = (html) => [...html.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0]);
const metaContent = (html, key, val) => {
  const t = metaTags(html).find((m) => (attr(m, key) || '').toLowerCase() === val.toLowerCase());
  return t ? attr(t, 'content') : null;
};

export function visibleText(html) {
  return String(html)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|template|svg)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function jsonLdTypes(html) {
  const blocks = [...String(html).matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  const types = new Set();
  let invalid = 0;
  const visit = (n) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(visit); return; }
    for (const t of [].concat(n['@type'] || [])) types.add(String(t));
    for (const v of Object.values(n)) if (v && typeof v === 'object') visit(v);
  };
  for (const b of blocks) {
    try { visit(JSON.parse(b)); } catch { invalid += 1; }
  }
  return { blocks: blocks.length, invalid, types: [...types] };
}

const check = (id, label, status, detail, fix) => ({ id, label, status, detail, ...(status !== 'pass' ? { fix } : {}) });
const sectionScore = (checks) => Math.round((checks.reduce((a, c) => a + (c.status === 'pass' ? 1 : c.status === 'warn' ? 0.5 : 0), 0) / (checks.length || 1)) * 100);

function challenge(body) {
  return /cf-chl|challenge-platform|just a moment\.\.\.|attention required|cf-browser-verification|captcha|access denied|ddos protection by|verify you are human|px-captcha|_incapsula_/i.test(body || '');
}

// A file is real only if it is not the app shell served for every path.
function softMissing(res, probe, home, { expectText = false } = {}) {
  if (!res || res.error || res.status !== 200) return true;
  const html = /text\/html/i.test(res.type);
  if (expectText && html) return true;
  if (html && probe && probe.status === 200 && /text\/html/i.test(probe.type) && (res.body === probe.body || res.body === home?.body)) return true;
  if (/^\s*<!doctype html|^\s*<html/i.test(res.body) && expectText) return true;
  return false;
}

// ---------- audit ----------
export async function auditSite(rawUrl, { fetchImpl = fetch, allowPrivate = false, now = Date.now } = {}) {
  const u = await assertPublic(rawUrl, { allowPrivate });
  const origin = u.origin;
  const get = (url, opts = {}) => safeGet(url, { fetchImpl, allowPrivate, ...opts });
  const probePath = `/__dryrun_probe_${Math.random().toString(36).slice(2, 10)}`;
  const [home, robots, llms, sitemap, probe, ...bots] = await Promise.all([
    get(u.toString()),
    get(origin + '/robots.txt', { accept: 'text/plain,*/*' }),
    get(origin + '/llms.txt', { accept: 'text/plain,text/markdown,*/*' }),
    get(origin + '/sitemap.xml', { accept: 'application/xml,text/xml,*/*' }),
    get(origin + probePath),
    ...Object.values(FIREWALL_UAS).map((ua) => get(u.toString(), { ua })),
  ]);
  if (home.error) return { url: u.toString(), error: `The page did not load: ${home.error}`, at: new Date(now()).toISOString() };
  const html = home.body || '';
  const sections = [];

  // 1. Crawler access
  const robotsMissing = softMissing(robots, probe, home, { expectText: true });
  const parsed = parseRobots(robotsMissing ? '' : robots.body);
  const path = u.pathname || '/';
  const blocked = AI_CRAWLERS.filter((a) => !robotsAllows(parsed, a, path).allowed);
  const c1 = [];
  c1.push(robotsMissing
    ? check('robots', 'robots.txt present', 'warn', 'No robots.txt (or the app shell answered for it). Crawlers fall back to "allow all".', 'Serve a plain-text /robots.txt that allows the AI crawlers you want and lists your sitemap.')
    : check('robots', 'robots.txt present', 'pass', `${parsed.groups.length} group(s).`));
  c1.push(blocked.length === 0
    ? check('ai-crawlers', `${AI_CRAWLERS.length} AI crawlers allowed`, 'pass', `All allowed on ${path}.`)
    : check('ai-crawlers', `${AI_CRAWLERS.length} AI crawlers allowed`, blocked.length > AI_CRAWLERS.length / 2 ? 'fail' : 'warn', `Blocked by robots.txt: ${blocked.join(', ')}.`, 'Remove the Disallow rules for the AI crawlers you want to be found by (training crawlers like GPTBot and CCBot can stay blocked by choice).'));
  const baseLen = visibleText(html).length;
  const fw = Object.keys(FIREWALL_UAS).map((name, i) => {
    const r = bots[i];
    if (r.error) return `${name}: ${r.error}`;
    if (r.status !== home.status && r.status >= 400) return `${name}: HTTP ${r.status}`;
    if (challenge(r.body) && !challenge(html)) return `${name}: challenge page`;
    const len = visibleText(r.body || '').length;
    if (baseLen > 200 && len < baseLen * 0.3) return `${name}: much shorter page (${len} vs ${baseLen} chars)`;
    return null;
  }).filter(Boolean);
  c1.push(fw.length
    ? check('firewall', 'Firewall lets AI agents through', 'fail', fw.join(' · '), 'Your CDN or WAF treats AI user agents differently from browsers. Allow-list the verified AI bots in the firewall rules (e.g. Cloudflare "AI bots" / bot fight mode settings).')
    : check('firewall', 'Firewall lets AI agents through', 'pass', `Same response for ${Object.keys(FIREWALL_UAS).join(', ')} as for a browser.`));
  const metaRobots = metaContent(html, 'name', 'robots') || '';
  const xRobots = home.headers.get('x-robots-tag') || '';
  c1.push(/noindex/i.test(metaRobots + ' ' + xRobots)
    ? check('noindex', 'No stray noindex', 'fail', `noindex in ${/noindex/i.test(metaRobots) ? 'meta robots' : 'X-Robots-Tag'}.`, 'Remove noindex from the production page (often left over from a staging config).')
    : check('noindex', 'No stray noindex', 'pass', 'No noindex in meta robots or X-Robots-Tag.'));
  sections.push({ id: 'crawlers', label: 'Crawler access', checks: c1 });

  // 2. Readable content (raw HTML, before JS)
  const text = visibleText(html);
  const wc = text.split(' ').filter((w) => /[a-z]{2,}/i.test(w)).length;
  const h1 = (html.match(/<h1\b/gi) || []).length;
  const h2 = (html.match(/<h2\b/gi) || []).length;
  const anchors = [...html.matchAll(/<a\b[^>]*>/gi)].map((m) => attr(m[0], 'href')).filter((h) => h !== null);
  const realLinks = anchors.filter((h) => h && !/^(#|javascript:|mailto:|tel:)/i.test(h));
  const imgs = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
  const noAlt = imgs.filter((t) => attr(t, 'alt') === null).length;
  const c2 = [
    wc >= 300 ? check('words', 'Text in the raw HTML', 'pass', `${wc} words before any JavaScript runs.`)
      : check('words', 'Text in the raw HTML', wc >= 80 ? 'warn' : 'fail', `${wc} words before JavaScript runs. AI crawlers mostly do not run JS.`, 'Render the main content on the server or pre-render it, so the HTML itself says what the product does.'),
    h1 === 1 ? check('h1', 'One h1', 'pass', `${h1} h1, ${h2} h2.`)
      : check('h1', 'One h1', h1 === 0 ? 'fail' : 'warn', `${h1} h1, ${h2} h2.`, 'Use exactly one h1 that names the product, and h2s for sections.'),
    h2 >= 2 ? check('h2', 'Section headings', 'pass', `${h2} h2.`) : check('h2', 'Section headings', 'warn', `${h2} h2.`, 'Give each section an h2 so the structure survives without CSS.'),
    realLinks.length >= 3 ? check('links', 'Real links', 'pass', `${realLinks.length} <a href> links that go somewhere.`)
      : check('links', 'Real links', realLinks.length ? 'warn' : 'fail', `${realLinks.length} real <a href> link(s); ${anchors.length - realLinks.length} are hash/JS-only.`, 'Use <a href="/page"> for navigation instead of click handlers or hash-only links.'),
    noAlt === 0 ? check('alt', 'Images have alt text', 'pass', `${imgs.length} image(s), all with alt.`)
      : check('alt', 'Images have alt text', noAlt > 3 ? 'fail' : 'warn', `${noAlt} of ${imgs.length} image(s) without alt.`, 'Add alt text that describes each meaningful image.'),
  ];
  sections.push({ id: 'content', label: 'Readable content', checks: c2 });

  // 3. Structured data
  const ld = jsonLdTypes(html);
  const has = (...t) => ld.types.some((x) => t.includes(x));
  const c3 = [
    ld.blocks && !ld.invalid ? check('jsonld', 'JSON-LD present and valid', 'pass', `${ld.blocks} block(s): ${ld.types.join(', ') || 'no @type'}.`)
      : check('jsonld', 'JSON-LD present and valid', 'fail', ld.blocks ? `${ld.invalid} of ${ld.blocks} block(s) do not parse.` : 'No JSON-LD.', 'Add a <script type="application/ld+json"> block describing the site and product.'),
    has('Organization', 'WebSite', 'Person', 'LocalBusiness') ? check('who', 'Who you are (Organization/WebSite)', 'pass', 'Found.') : check('who', 'Who you are (Organization/WebSite)', 'warn', 'No Organization or WebSite.', 'Add an Organization or WebSite node with name, url and sameAs links.'),
    has('Product', 'SoftwareApplication', 'WebApplication', 'Offer', 'Service') ? check('what', 'What you offer (Product/SoftwareApplication/Offer)', 'pass', 'Found.') : check('what', 'What you offer (Product/SoftwareApplication/Offer)', 'warn', 'No Product, SoftwareApplication or Offer.', 'Add a SoftwareApplication (or Product) with an Offer for the price.'),
    has('FAQPage') ? check('faq', 'Q&A (FAQPage)', 'pass', 'Found.') : check('faq', 'Q&A (FAQPage)', 'warn', 'No FAQPage.', 'If the page has an FAQ, mark it up as FAQPage so answers can be quoted.'),
  ];
  sections.push({ id: 'structured', label: 'Structured data', checks: c3 });

  // 4. AI and crawl files
  const spa = probe && probe.status === 200 && /text\/html/i.test(probe.type);
  const llmsMissing = softMissing(llms, probe, home, { expectText: true });
  const smMissing = softMissing(sitemap, probe, home) || !/<(urlset|sitemapindex)\b/i.test(sitemap.body || '');
  const c4 = [
    llmsMissing ? check('llms', '/llms.txt', 'warn', llms?.status === 200 ? 'Answers 200 but it is the HTML app shell (soft 404).' : `HTTP ${llms?.status ?? llms?.error}.`, 'Add /llms.txt: a short markdown summary of what the product is, with links to key pages.')
      : check('llms', '/llms.txt', 'pass', `${(llms.body || '').length} bytes of text.`),
    smMissing ? check('sitemap', '/sitemap.xml', 'warn', sitemap?.status === 200 ? 'Answers 200 but is not a sitemap (soft 404 or HTML).' : `HTTP ${sitemap?.status ?? sitemap?.error}.`, 'Serve an XML sitemap listing the public pages.')
      : check('sitemap', '/sitemap.xml', 'pass', 'Valid urlset or sitemap index.'),
    parsed.sitemaps.length ? check('robots-sitemap', 'robots.txt lists the sitemap', 'pass', parsed.sitemaps[0]) : check('robots-sitemap', 'robots.txt lists the sitemap', 'warn', 'No Sitemap: line.', 'Add "Sitemap: https://your.site/sitemap.xml" to robots.txt.'),
    spa ? check('soft404', 'Unknown paths return 404', 'warn', `${probePath} returned 200 text/html: the app shell answers every path, which hides missing files.`, 'Return a real 404 for unknown paths (or at least for .txt/.xml files).')
      : check('soft404', 'Unknown paths return 404', 'pass', `${probePath} returned ${probe?.status ?? probe?.error}.`),
  ];
  sections.push({ id: 'files', label: 'AI and crawl files', checks: c4 });

  // 5. Metadata
  const title = ((html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').replace(/\s+/g, ' ').trim();
  const desc = metaContent(html, 'name', 'description');
  const canonical = [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]).find((t) => /rel\s*=\s*["']?canonical/i.test(t));
  const lang = attr((html.match(/<html\b[^>]*>/i) || [''])[0], 'lang');
  const og = ['og:title', 'og:description', 'og:image'].filter((k) => !metaContent(html, 'property', k));
  const tw = metaContent(html, 'name', 'twitter:card');
  const c5 = [
    !title ? check('title', 'Title', 'fail', 'No <title>.', 'Add a <title> with the product name and what it does.')
      : SCAFFOLD_TITLES.test(title) || /vite \+ react|create next app|react app/i.test(title) ? check('title', 'Title', 'fail', `Default scaffold title: "${title}".`, 'Replace the generator\'s default title with the product name and what it does.')
        : check('title', 'Title', title.length > 70 ? 'warn' : 'pass', `"${title.slice(0, 90)}"`, 'Keep the title under ~60 characters.'),
    desc ? check('description', 'Meta description', desc.length < 50 ? 'warn' : 'pass', desc.slice(0, 160), 'Write a 50–160 character description of what the product does.') : check('description', 'Meta description', 'fail', 'Missing.', 'Add <meta name="description"> with what the product does and for whom.'),
    canonical ? check('canonical', 'Canonical URL', 'pass', attr(canonical, 'href')) : check('canonical', 'Canonical URL', 'warn', 'Missing.', 'Add <link rel="canonical" href="https://your.site/">.'),
    lang ? check('lang', 'html lang', 'pass', lang) : check('lang', 'html lang', 'warn', 'Missing.', 'Add lang="en" (or the right language) to <html>.'),
    !og.length ? check('og', 'Open Graph', 'pass', 'og:title, og:description, og:image.') : check('og', 'Open Graph', og.length === 3 ? 'fail' : 'warn', `Missing: ${og.join(', ')}.`, 'Add og:title, og:description and og:image so shared links and agents get a summary.'),
    tw ? check('twitter', 'Twitter card', 'pass', tw) : check('twitter', 'Twitter card', 'warn', 'Missing.', 'Add <meta name="twitter:card" content="summary_large_image">.'),
  ];
  sections.push({ id: 'metadata', label: 'Metadata', checks: c5 });

  // 6. Trust and answers
  const finalUrl = new URL(home.url);
  const findPage = (re) => [...html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)].some((m) => {
    const href = attr(m[0], 'href') || '';
    if (!href || /^(javascript:)/i.test(href)) return false;
    return re.test(href) || re.test(visibleText(m[1]));
  });
  const pages = { pricing: findPage(/pricing|plans?\b|price/i), about: findPage(/about|team|company/i), contact: findPage(/contact|support|mailto:|github\.com\/[^/]+\/[^/]+\/issues/i) };
  const missingPages = Object.entries(pages).filter(([, v]) => !v).map(([k]) => k);
  const c6 = [
    finalUrl.protocol === 'https:' ? check('https', 'HTTPS', 'pass', 'Served over HTTPS.') : check('https', 'HTTPS', 'fail', 'Served over plain HTTP.', 'Serve the site over HTTPS and redirect HTTP to it.'),
    home.ttfb <= 800 ? check('ttfb', 'Time to first byte', 'pass', `${home.ttfb} ms (total ${home.ms} ms).`)
      : check('ttfb', 'Time to first byte', home.ttfb <= 2500 ? 'warn' : 'fail', `${home.ttfb} ms (total ${home.ms} ms). Agents give up on slow pages.`, 'Cache the HTML at the edge or keep the server warm (free hosts sleep).'),
    !missingPages.length ? check('pages', 'Pricing, about, contact reachable by links', 'pass', 'All three linked from the HTML.')
      : check('pages', 'Pricing, about, contact reachable by links', missingPages.length === 3 ? 'fail' : 'warn', `Not linked from the HTML: ${missingPages.join(', ')}.`, 'Link pricing, about and contact pages with plain <a href> links in the nav or footer.'),
  ];
  sections.push({ id: 'trust', label: 'Trust and answers', checks: c6 });

  for (const s of sections) s.score = sectionScore(s.checks);
  const score = Math.round(sections.reduce((a, s) => a + s.score, 0) / sections.length);
  return { url: u.toString(), finalUrl: home.url, status: home.status, score, sections, crawlers: AI_CRAWLERS, at: new Date(now()).toISOString() };
}

// Website-like links only: video, explorer, wallet and tool links are not the project's site.
const NOT_SITE = /youtube\.com|youtu\.be|loom\.com|vimeo\.com|(^|\/\/)(www\.)?(x|twitter)\.com|nearblocks\.io|explorer\.|github\.com|githubusercontent|docs\.google|drive\.google|wallet|meteor|cloud\.near\.ai|(^|\/\/)(www\.)?near\.(org|ai)\b|near-intents|1click|npmjs|crates\.io|docs\.|\/\/([a-z]+\.)?(vercel|render|netlify)\.com\b|figma\.com|notion\.so|discord|t\.me|telegram|shields\.io|nearhackathon\.com|\/api\/|localhost|127\.0\.0\.1|example\.(com|org)/i;
const HOSTED = /\.(vercel\.app|netlify\.app|onrender\.com|pages\.dev|fly\.dev|railway\.app|herokuapp\.com|github\.io|web\.app|firebaseapp\.com|replit\.app|surge\.sh|deno\.dev)\b/i;
const STRONG_CUE = /\b(live demo|live site|live app|live at|live:|demo:|demo site|demo app|website:|site:|deployed (at|to|on)|hosted (at|on)|try it( live)?( at|:)|app url|production url)/i;
const SITE_CUE = /\b(live|demo|deployed|deployment|website|web app|hosted|production|try it|play|launch|app url|site)\b/i;

// Accepts README text or a list of links. Prefers a link on a line that says live/demo/website,
// then any link on a hosting platform. Never guesses from an arbitrary third-party link.
export function siteUrlFrom(input) {
  const clean = (u) => u.replace(/[.,;:!?*_`]+$/, '');
  const ok = (u) => /^https?:\/\//i.test(u) && !NOT_SITE.test(u);
  if (Array.isArray(input)) {
    const list = input.map(clean).filter(ok);
    return list.find((u) => HOSTED.test(u)) || list[0] || null;
  }
  const lines = String(input || '').split(/\r?\n/);
  const urlsOf = (line) => [...line.matchAll(/https?:\/\/[^\s)<>"'\]|]+/g)].map((m) => clean(m[0])).filter(ok);
  for (const cue of [STRONG_CUE, SITE_CUE]) for (const line of lines) if (cue.test(line.replace(/https?:\/\/\S+/g, ''))) { const u = urlsOf(line)[0]; if (u) return u; }
  for (const line of lines) { const u = urlsOf(line).find((x) => HOSTED.test(x)); if (u) return u; }
  return null;
}

export function createAuditor({ ttlMs = 30 * 60 * 1000, max = 300, fetchImpl = fetch, allowPrivate = false } = {}) {
  const cache = new Map();
  const inflight = new Map();
  return async function audit(url) {
    const key = String(url).trim().replace(/#.*$/, '');
    const hit = cache.get(key);
    if (hit && Date.now() - hit.t < ttlMs) return { ...hit.v, cached: true };
    if (inflight.has(key)) return inflight.get(key);
    const p = auditSite(key, { fetchImpl, allowPrivate })
      .catch((e) => ({ url: key, error: e.status ? e.message : 'Audit failed' }))
      .then((v) => {
        inflight.delete(key);
        cache.set(key, { t: Date.now(), v });
        if (cache.size > max) cache.delete(cache.keys().next().value);
        return v;
      });
    inflight.set(key, p);
    return p;
  };
}
