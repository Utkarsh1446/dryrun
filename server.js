import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { checkRepo, checkSubmission, checkDirectory, score } from './lib/checks.js';
import { snapshot, validRepo } from './lib/repo.js';
import * as pay from './lib/pay.js';
import { deepReview } from './lib/deep.js';

const PORT = process.env.PORT || 8787;
const FREE_DEEP = process.env.DRYRUN_FREE_DEEP === '1'; // lets judges reproduce the paid path without paying
const used = new Map(); // depositAddress -> repo. shortcut: in-memory, a restart forgets which deposits were spent; move to a DB before real volume.

let dir = { at: 0, list: [] };
async function directory() {
  if (Date.now() - dir.at < 600_000) return dir.list;
  const page = (n) => fetch(`https://nearhackathon.com/api/projects?page=${n}`, { signal: AbortSignal.timeout(15_000) }).then((r) => r.json());
  try {
    const first = await page(1);
    const rest = await Promise.all(Array.from({ length: Math.ceil(first.total / first.pageSize) - 1 }, (_, i) => page(i + 2).catch(() => ({ projects: [] }))));
    dir = { at: Date.now(), list: [first, ...rest].flatMap((p) => p.projects || []) };
  } catch { /* directory is a bonus check; keep the stale copy */ }
  return dir.list;
}

async function body(req) {
  let s = '';
  for await (const c of req) { s += c; if (s.length > 64_000) throw Object.assign(new Error('Body too large'), { status: 413 }); }
  try { return JSON.parse(s || '{}'); } catch { throw Object.assign(new Error('Invalid JSON'), { status: 400 }); }
}

const routes = {
  'POST /api/check': async (req) => {
    const { repo, submission = {} } = await body(req);
    const snap = await snapshot(repo);
    const results = [...checkRepo(snap), ...checkSubmission(submission), ...checkDirectory(await directory(), submission)];
    return { repo, ...score(results), results, directorySize: dir.list.length };
  },
  'GET /api/tokens': async () => ({ priceUsd: Number(pay.config().priceUsdc) / 1e6, live: Boolean(pay.config().recipient), freeDeep: FREE_DEEP, tokens: await pay.tokens() }),
  'POST /api/quote': async (req) => {
    const { originAsset, refundTo } = await body(req);
    if (typeof originAsset !== 'string' || typeof refundTo !== 'string' || !refundTo.trim() || refundTo.length > 128) throw Object.assign(new Error('originAsset and refundTo are required'), { status: 400 });
    return pay.quote({ originAsset, refundTo: refundTo.trim() });
  },
  'GET /api/status': async (req, url) => {
    const st = await pay.status(url.searchParams.get('depositAddress') || '');
    return { status: st.status, paid: pay.isPaid(st) };
  },
  'POST /api/deep': async (req) => {
    const { repo, depositAddress } = await body(req);
    if (!validRepo(repo)) throw Object.assign(new Error('Invalid repo URL'), { status: 400 });
    if (!FREE_DEEP) {
      if (!depositAddress || !pay.isPaid(await pay.status(depositAddress))) throw Object.assign(new Error('Payment not settled yet'), { status: 402 });
      if (used.has(depositAddress) && used.get(depositAddress) !== repo) throw Object.assign(new Error('This payment was already used for another repo'), { status: 409 });
      used.set(depositAddress, repo);
    }
    return deepReview(await snapshot(repo));
  },
};

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const send = (code, obj, type = 'application/json') => { res.writeHead(code, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff' }); res.end(type === 'application/json' ? JSON.stringify(obj) : obj); };
  try {
    const route = routes[`${req.method} ${url.pathname}`];
    if (route) return send(200, await route(req, url));
    if (req.method === 'GET' && url.pathname === '/') return send(200, await readFile(new URL('./public/index.html', import.meta.url)), 'text/html; charset=utf-8');
    send(404, { error: 'Not found' });
  } catch (e) {
    if (!e.status) console.error(e);
    send(e.status || 500, { error: e.status ? e.message : 'Internal error' });
  }
}).listen(PORT, () => console.log(`DryRun on http://localhost:${PORT}  payments:${pay.config().recipient ? 'live -> ' + pay.config().recipient : 'dry'}  deep:${process.env.NEAR_AI_API_KEY ? 'on' : 'off'}`));
