import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRODUCT } from './lib/brand.js';
import { rerankIdea, RERANK_KEEP, startupLens } from './lib/ai.js';
import { assessRepo } from './lib/assess.js';
import { createJudge } from './lib/judge.js';
import { readmeOf } from './lib/quality.js';
import { LABEL as STARTUP_LABEL, LINK as STARTUP_LINK } from './lib/rubrics/startup.js';
import { buildIndex, DOMAIN_GENERIC, searchIdea, similarByTrack, stem, strength } from './lib/similar.js';
import { checkDirectory, checkSubmission, score } from './lib/checks.js';
import { quietTracks } from './lib/cluster.js';
import { deepReview, finishPaidReview } from './lib/deep.js';
import { overviewFrom } from './lib/field.js';
import { near } from './lib/hackathons/near.js';
import { canonRepo } from './lib/match.js';
import * as pay from './lib/pay.js';
import { placeUser } from './lib/rank.js';
import { validRepo, snapshot } from './lib/repo.js';
import { nearRulebook } from './lib/rulebook.js';
import { createScanner } from './lib/scan.js';
import { createStore } from './lib/store.js';
import { orderTriage, parseRepoList } from './lib/triage.js';

const root = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8787;
const FREE_DEEP = process.env.DRYRUN_FREE_DEEP === '1';
const used = new Map();
const pendingReviews = new Set();
const jobs = new Map();

const store = createStore(process.env.DRYRUN_DATA || join(root, 'data'));
const judge = createJudge({ store, rubric: nearRulebook.judging });
const scanner = process.env.DRYRUN_SCAN === '0' ? null : createScanner({
  judge,
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
        const { results, quality, ...summary } = await assessRepo(snap, { rulebook: nearRulebook });
        raw.push({ repo: item.repo, duplicate: item.duplicate, copies: item.copies, directoryNames, error: null, ...summary, content: quality.signals.map(({ id, label, points, weight }) => ({ id, label, points, weight })) });
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
    const extraResults = [...checkSubmission(submission), ...checkDirectory(directoryProjects(), { tracks: trackList })];
    const [a, ai] = await Promise.all([
      assessRepo(snap, { rulebook: nearRulebook, extraResults }),
      judge.judge(url, snap),
    ]);
    const { results, ...summary } = a;
    const current = field();
    const placement = placeUser({ ...summary, tracks: trackList }, current._ranked, url);
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
      aiJudging: Boolean(process.env.NEAR_AI_API_KEY),
      judge: ai,
      judgeCriteria: nearRulebook.judging.criteria.map(({ id, label }) => ({ id, label })),
      aiUsedForRank: false,
    };
  },
  'POST /api/idea': async (req) => {
    const { text } = await body(req);
    const idea = String(text || '').trim();
    if (idea.length < 3 || idea.length > 2000) throw Object.assign(new Error('Describe the idea in 3–2000 characters'), { status: 400 });
    const current = field();
    if (!current.ready) throw Object.assign(new Error('The directory is still loading. Try again in a minute.'), { status: 503 });
    const projects = scanner.ideaProjects();
    const lex = searchIdea(buildIndex(projects), idea, { limit: 20 });
    const label = (id) => near.tracks.find((t) => t.id === id)?.label || id;
    const [rr, startup] = await Promise.all([
      rerankIdea(idea, lex.results.map(({ id, name, blurb, tracks: t }) => ({ id, name, blurb, tracks: t }))),
      startupLens(idea, { kind: 'idea' }),
    ]);
    const lexById = new Map(lex.results.map((r) => [r.id, r]));
    let mode = 'lexical';
    let similar;
    if (rr?.matches) {
      mode = 'ai';
      similar = rr.matches.filter((m) => m.overlap >= RERANK_KEEP).sort((a, b) => b.overlap - a.overlap).slice(0, 10).map((m) => {
        const lx = lexById.get(m.id) || {};
        return { id: m.id, name: m.name, tracks: m.tracks, score: m.overlap / 100, overlap: m.overlap, strength: m.overlap >= 70 ? 'strong' : 'partial', same: m.same, reason: m.reason, sim: lx.sim ?? null, why: lx.why || null };
      });
    } else {
      similar = lex.results.filter((r) => r.sim >= 0.2).slice(0, 10).map((r) => ({ id: r.id, name: r.name, tracks: r.tracks, score: r.sim, sim: r.sim, strength: strength(r.sim), why: r.why }));
    }
    similar = similar.map((s) => ({ ...s, trackLabels: (s.tracks || []).map(label) }));
    const crowding = similarByTrack(similar, current.tracks, { threshold: mode === 'ai' ? 0.5 : 0.3 });
    const ideaWords = new Set(lex.results.flatMap((r) => r.why.terms));
    const clusters = (current.clusters?.tokens || []).filter((c) => ideaWords.has(stem(c.label)) && !DOMAIN_GENERIC.has(stem(c.label))).slice(0, 6)
      .map(({ label: l, count, names }) => ({ label: l, count, names }));
    return {
      speculation: true,
      disclaimer: PRODUCT.disclaimer,
      mode,
      specific: lex.specific,
      info: lex.info,
      rerankError: rr?.error || null,
      similar,
      crowding,
      quiet: quietTracks(current.tracks, 3),
      clusters,
      tracks: current.tracks,
      total: current.total,
      withDescriptions: projects.filter((p) => p.blurb).length,
      startup,
      startupLabel: STARTUP_LABEL,
      startupLink: STARTUP_LINK,
      aiOn: Boolean(process.env.NEAR_AI_API_KEY),
    };
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
    const a = await assessRepo(snap, { rulebook: nearRulebook, extraResults: [...checkSubmission(submission), ...checkDirectory(directoryProjects(), submission)] });
    return { repo: canonRepo(repo) || repo, ...a, rules: score(a.results), directorySize: directoryProjects().length, aiJudging: Boolean(process.env.NEAR_AI_API_KEY) };
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
      run: async () => {
        const snap = await snapshot(url);
        const readme = readmeOf(snap.files)?.text || '';
        const [review, startup] = await Promise.all([
          deepReview(snap),
          startupLens(readme || [...snap.files.keys()].slice(0, 80).join('\n'), { kind: 'repo' }).catch(() => null),
        ]);
        return { ...review, startup, startupLabel: STARTUP_LABEL, startupLink: STARTUP_LINK };
      },
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
