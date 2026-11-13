import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRODUCT } from './lib/brand.js';
import { criteriaScore, ideaAssist } from './lib/ai.js';
import { checkDirectory, checkRepo, checkSubmission, score } from './lib/checks.js';
import { ideaOverlap, quietTracks } from './lib/cluster.js';
import { deepReview, finishPaidReview } from './lib/deep.js';
import { overviewFrom } from './lib/field.js';
import { near } from './lib/hackathons/near.js';
import { canonRepo } from './lib/match.js';
import * as pay from './lib/pay.js';
import { placeUser, summarise } from './lib/rank.js';
import { validRepo, snapshot } from './lib/repo.js';
import { nearRulebook } from './lib/rulebook.js';
import { createScanner } from './lib/scan.js';
import { createStore } from './lib/store.js';
import { tokens } from './lib/text.js';
import { orderTriage, parseRepoList } from './lib/triage.js';

const root = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8787;
const FREE_DEEP = process.env.DRYRUN_FREE_DEEP === '1';
const used = new Map();
const pendingReviews = new Set();
const jobs = new Map();

const store = createStore(process.env.DRYRUN_DATA || join(root, 'data'));
const scanner = process.env.DRYRUN_SCAN === '0' ? null : createScanner({
  adapter: near,
  rulebook: nearRulebook,
  store,
  snapshot,
  log: (line) => console.log(line),
  gapMs: Number(process.env.DRYRUN_GAP_MS || 200),
  tweetGapMs: Number(process.env.DRYRUN_TWEET_GAP_MS || 400),
  refreshMs: Number(process.env.DRYRUN_REFRESH_MS || 10 * 60 * 1000),
});

function emptyField() {
  return {
    ready: false,
    speculation: true,
    disclaimer: PRODUCT.disclaimer,
    hackathon: { id: near.id, name: near.name },
    total: null,
    collected: null,
    fetchedAt: null,
    growth: [],
    tracks: [],
    clusters: { tokens: [], names: [], near: [] },
    coverage: null,
    scan: { phase: 'idle', error: 'Background scan is off (DRYRUN_SCAN=0).' },
    board: [],
    _ranked: [],
  };
}

function field() {
  return scanner ? scanner.getField() : emptyField();
}

function meta() {
  return {
    product: PRODUCT,
    priceUsd: Number(pay.config().priceUsdc) / 1e6,
    paymentsLive: Boolean(pay.config().recipient),
    ai: Boolean(process.env.NEAR_AI_API_KEY),
    aiBoard: process.env.DRYRUN_AI_BOARD === '1' && Boolean(process.env.NEAR_AI_API_KEY),
    freeDeep: FREE_DEEP,
    hackathon: { id: near.id, name: near.name, tracks: near.tracks },
  };
}

function publicField(source) {
  const clusters = source.clusters || { tokens: [], names: [], near: [] };
  const trim = (list) => (list || []).map(({ kind, label, count, names }) => ({ kind, label, count, names }));
  return {
    ready: source.ready,
    speculation: true,
    disclaimer: source.disclaimer,
    hackathon: source.hackathon,
    total: source.total,
    collected: source.collected,
    fetchedAt: source.fetchedAt,
    growth: source.growth,
    tracks: source.tracks,
    clusters: { tokens: trim(clusters.tokens), names: trim(clusters.names), near: trim(clusters.near) },
    coverage: source.coverage,
    scan: source.scan,
    board: source.board,
  };
}

function directoryProjects() {
  return (scanner ? scanner.projects() : []).map((p) => ({ ...p, project_name: p.name }));
}

async function body(req) {
  let s = '';
  for await (const c of req) {
    s += c;
    if (s.length > 200_000) throw Object.assign(new Error('Body too large'), { status: 413 });
  }
  try { return JSON.parse(s || '{}'); } catch { throw Object.assign(new Error('Invalid JSON'), { status: 400 }); }
}

async function runTriage(job, items) {
  const raw = [];
  try {
    for (const item of items) {
      const directoryNames = scanner ? scanner.namesForRepo(item.repo) : [];
      try {
        const snap = await snapshot(item.repo);
        const summary = summarise(nearRulebook.checkRepo(snap), nearRulebook.score);
        raw.push({ repo: item.repo, duplicate: item.duplicate, copies: item.copies, directoryNames, error: null, ...summary });
      } catch (e) {
        raw.push({
          repo: item.repo,
          duplicate: item.duplicate,
          copies: item.copies,
          directoryNames,
          error: e.status ? e.message : 'Could not read the repository',
          score: null,
          fails: 0,
          warns: 0,
          fixes: [],
          flags: { clone: 'fail' },
        });
      }
      job.completed = raw.length;
      job.items = orderTriage(raw);
    }
    job.done = true;
  } catch (e) {
    job.error = 'Triage stopped';
    job.done = true;
    console.error(e);
  }
}

const routes = {
  'GET /api/meta': async () => meta(),
  'GET /api/overview': async () => overviewFrom(field(), meta()),
  'GET /api/field': async () => publicField(field()),
  'POST /api/rank': async (req) => {
    const { repo, tracks = [] } = await body(req);
    if (!validRepo(String(repo || '').trim())) throw Object.assign(new Error('Repository must be a public https://github.com/<owner>/<repo> URL'), { status: 400 });
    const url = canonRepo(String(repo).trim());
    const trackList = Array.isArray(tracks) ? [...new Set(tracks.map(String))].slice(0, 13) : [];
    const snap = await snapshot(url);
    const submission = trackList.length ? { tracks: trackList } : {};
    const results = [
      ...checkRepo(snap),
      ...checkSubmission(submission),
      ...checkDirectory(directoryProjects(), { tracks: trackList }),
    ];
    const summary = summarise(results, score);
    const current = field();
    const placement = placeUser({ ...summary, tracks: trackList }, current._ranked, url);
    const ai = process.env.NEAR_AI_API_KEY ? await criteriaScore(snap) : null;
    return {
      speculation: true,
      disclaimer: PRODUCT.disclaimer,
      repo: url,
      ...summary,
      placement,
      directory: {
        total: current.total,
        collected: current.collected,
        matched: current.coverage?.matched ?? null,
        scored: current.coverage?.scored ?? null,
      },
      ai,
      aiUsedForRank: false,
    };
  },
  'POST /api/idea': async (req) => {
    const { text } = await body(req);
    const idea = String(text || '').trim();
    if (idea.length < 3 || idea.length > 2000) throw Object.assign(new Error('Describe the idea in 3–2000 characters'), { status: 400 });
    const current = field();
    if (!current.ready) throw Object.assign(new Error('The directory is still loading. Try again in a minute.'), { status: 503 });
    const projects = scanner.projects();
    const similar = ideaOverlap(idea, projects, { limit: 8 }).map((row) => ({
      ...row,
      trackLabels: row.tracks.map((id) => near.tracks.find((t) => t.id === id)?.label || id),
    }));
    const ideaTokens = new Set(tokens(idea));
    const clusters = (current.clusters?.tokens || []).filter((c) => ideaTokens.has(c.label)).slice(0, 6)
      .map(({ label, count, names }) => ({ label, count, names }));
    const quiet = quietTracks(current.tracks, 3);
    let ai = null;
    if (process.env.NEAR_AI_API_KEY) {
      const context = [
        `Hackathon: ${near.name}`,
        `Tracks: ${near.tracks.map((t) => `${t.id} (${t.label}, ${current.tracks.find((x) => x.id === t.id)?.count ?? 0} entries)`).join('; ')}`,
        `Similar names: ${similar.map((s) => s.name).join('; ') || 'none'}`,
        `Quietest tracks: ${quiet.map((t) => `${t.id} ${t.count}`).join('; ')}`,
      ].join('\n');
      ai = await ideaAssist(idea, context, { trackIds: near.tracks.map((t) => t.id) });
    }
    return { speculation: true, disclaimer: PRODUCT.disclaimer, similar, quiet, clusters, tracks: current.tracks, total: current.total, ai };
  },
  'POST /api/triage': async (req) => {
    const { text } = await body(req);
    const parsed = parseRepoList(text, { limit: 20 });
    if (!parsed.items.length) throw Object.assign(new Error('Paste one or more https://github.com/owner/repo URLs'), { status: 400 });
    const id = randomBytes(8).toString('hex');
    const job = { id, done: false, total: parsed.items.length, overflow: parsed.overflow, completed: 0, items: [], error: null };
    jobs.set(id, job);
    if (jobs.size > 24) {
      const oldest = jobs.keys().next().value;
      if (oldest && oldest !== id) jobs.delete(oldest);
    }
    runTriage(job, parsed.items);
    return { id, total: job.total, overflow: job.overflow };
  },
  'GET /api/triage': async (req, url) => {
    const job = jobs.get(url.searchParams.get('id') || '');
    if (!job) throw Object.assign(new Error('Unknown triage job'), { status: 404 });
    return job;
  },
  'POST /api/check': async (req) => {
    const { repo, submission = {} } = await body(req);
    const snap = await snapshot(repo);
    const results = [...checkRepo(snap), ...checkSubmission(submission), ...checkDirectory(directoryProjects(), submission)];
    return { repo: canonRepo(repo) || repo, ...score(results), results, directorySize: directoryProjects().length };
  },
  'GET /api/tokens': async () => ({ priceUsd: meta().priceUsd, live: meta().paymentsLive, freeDeep: FREE_DEEP, tokens: await pay.tokens() }),
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
    const url = canonRepo(String(repo || '').trim());
    if (!url) throw Object.assign(new Error('Invalid repo URL'), { status: 400 });
    return finishPaidReview({
      free: FREE_DEEP,
      used,
      pending: pendingReviews,
      depositAddress,
      repo: url,
      paid: async () => pay.isPaid(await pay.status(depositAddress)),
      run: async () => deepReview(await snapshot(url)),
    });
  },
};

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

const FILES = {
  '/app.js': ['public/app.js', 'text/javascript; charset=utf-8'],
  '/app.css': ['public/app.css', 'text/css; charset=utf-8'],
};

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const send = (code, obj, type = 'application/json') => {
    res.writeHead(code, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' });
    res.end(type === 'application/json' ? JSON.stringify(obj) : obj);
  };
  try {
    const route = routes[`${req.method} ${url.pathname}`];
    if (route) return send(200, await route(req, url));
    if (req.method === 'GET' && url.pathname === '/') {
      const raw = await readFile(join(root, 'public/index.html'), 'utf8');
      const html = raw
        .replaceAll('__NAME__', esc(PRODUCT.name))
        .replaceAll('__TAGLINE__', esc(PRODUCT.tagline))
        .replaceAll('__DISCLAIMER__', esc(PRODUCT.disclaimer));
      return send(200, html, 'text/html; charset=utf-8');
    }
    const file = FILES[url.pathname];
    if (req.method === 'GET' && file) return send(200, await readFile(join(root, file[0])), file[1]);
    send(404, { error: 'Not found' });
  } catch (e) {
    if (!e.status) console.error(e);
    send(e.status || 500, { error: e.status ? e.message : 'Internal error' });
  }
}).listen(PORT, () => {
  const payTo = pay.config().recipient;
  console.log(`${PRODUCT.name} on http://localhost:${PORT}  payments:${payTo ? 'live -> ' + payTo : 'dry'}  deep:${process.env.NEAR_AI_API_KEY ? 'on' : 'off'}  scan:${scanner ? 'on' : 'off'}`);
});
