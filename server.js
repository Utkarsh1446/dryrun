import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESTIMATE_HIDDEN, ESTIMATE_SHOWN, publicBoard } from './lib/anonymise.js';
import { PRODUCT } from './lib/brand.js';
import { chainStatus, readReceipt, recordReceipt } from './lib/chain.js';
import { CHECKER_VERSION, checkPayload, hashPayload } from './lib/hash.js';
import { nearAiStatus } from './lib/nearai.js';
import { rerankIdea, RERANK_KEEP, startupLens } from './lib/ai.js';
import { assessRepo } from './lib/assess.js';
import { createJudge } from './lib/judge.js';
import { readmeOf } from './lib/quality.js';
import { createAuditor, siteUrlFrom } from './lib/readiness.js';
import { LABEL as STARTUP_LABEL, LINK as STARTUP_LINK } from './lib/rubrics/startup.js';
import { buildIndex, DOMAIN_GENERIC, searchIdea, similarByTrack, stem, strength } from './lib/similar.js';
import { checkDirectory, checkSubmission, score } from './lib/checks.js';
import { quietTracks } from './lib/cluster.js';
import { deepReview } from './lib/deep.js';
import { settleDryReview } from './lib/settle.js';
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
const jobs = new Map();

const store = createStore(process.env.DRYRUN_DATA || join(root, 'data'));
const audit = createAuditor();
const siteFor = (snap, given) => (given && /^https?:\/\//.test(String(given)) ? String(given).trim() : siteUrlFrom(readmeOf(snap.files)?.text || ''));
const readinessFor = async (url) => (url ? audit(url) : null);
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
  const ai = nearAiStatus();
  const chain = chainStatus();
  return {
    product: PRODUCT,
    priceUsd: Number(pay.config().priceUsdc) / 1e6,
    paymentsLive: false,
    quoteMode: 'dry',
    fundsMoved: false,
    ai: ai.configured,
    aiNote: ai.note,
    aiBoard: process.env.DRYRUN_AI_BOARD === '1' && ai.configured,
    freeDeep: FREE_DEEP,
    chain,
    checker: CHECKER_VERSION,
    hackathon: { id: near.id, name: near.name, tracks: near.tracks },
  };
}

function publicField(source, { names = false } = {}) {
  const clusters = source.clusters || { tokens: [], names: [], near: [] };
  const trim = (list) => (list || []).map(({ kind, label, count, names: groupNames }) => ({ kind, label, count, names: groupNames }));
  return {
    ready: source.ready,
    speculation: true,
    estimate: true,
    names: names ? 'shown' : 'anonymised',
    estimateLabel: names ? ESTIMATE_SHOWN : ESTIMATE_HIDDEN,
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
    board: publicBoard(source.board, { names }),
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
        const [{ results, quality, ...summary }, rd] = await Promise.all([
          assessRepo(snap, { rulebook: nearRulebook }),
          readinessFor(siteFor(snap)).catch(() => null),
        ]);
        summary.readiness = rd ? { url: rd.url, score: rd.score ?? null, error: rd.error || null, sections: (rd.sections || []).map(({ id, label, score }) => ({ id, label, score })) } : null;
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
  'GET /api/field': async (req, url) => publicField(field(), { names: url.searchParams.get('names') === '1' }),
  'POST /api/rank': async (req) => {
    const { repo, tracks = [], site } = await body(req);
    if (!validRepo(String(repo || '').trim())) throw Object.assign(new Error('Repository must be a public https://github.com/<owner>/<repo> URL'), { status: 400 });
    const url = canonRepo(String(repo).trim());
    const trackList = Array.isArray(tracks) ? [...new Set(tracks.map(String))].slice(0, 13) : [];
    const snap = await snapshot(url);
    const submission = trackList.length ? { tracks: trackList } : {};
    const extraResults = [...checkSubmission(submission), ...checkDirectory(directoryProjects(), { tracks: trackList })];
    const siteUrl = siteFor(snap, site);
    const [a, ai, readiness] = await Promise.all([
      assessRepo(snap, { rulebook: nearRulebook, extraResults }),
      judge.judge(url, snap),
      readinessFor(siteUrl),
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
      readiness,
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
    const [a, readiness] = await Promise.all([
      assessRepo(snap, { rulebook: nearRulebook, extraResults: [...checkSubmission(submission), ...checkDirectory(directoryProjects(), submission)] }),
      readinessFor(siteFor(snap, submission?.siteUrl)),
    ]);
    const payload = checkPayload({ repo: canonRepo(repo) || repo, sha: a.sha, assessment: a });
    const resultHash = a.sha ? hashPayload(payload) : null;
    let receipt = null;
    let receiptError = null;
    if (resultHash && chainStatus().configured) {
      try {
        receipt = await recordReceipt({
          repo_url: payload.repo,
          commit_sha: a.sha,
          result_hash: resultHash,
          checker_version: CHECKER_VERSION,
          kind: 'check',
          quote_hash: null,
        });
      } catch (error) {
        receiptError = error.status ? error.message : 'The testnet receipt was not written.';
      }
    } else if (!chainStatus().configured) {
      receiptError = 'Testnet recording is off. Set NEAR_CONTRACT_ID and NEAR_PRIVATE_KEY to write a receipt.';
    }
    return {
      repo: payload.repo,
      ...a,
      readiness,
      rules: score(a.results),
      directorySize: directoryProjects().length,
      aiJudging: Boolean(process.env.NEAR_AI_API_KEY),
      resultHash,
      checker: CHECKER_VERSION,
      receipt,
      receiptError,
    };
  },
  'POST /api/readiness': async (req) => {
    const { url } = await body(req);
    if (typeof url !== 'string' || url.length > 500 || !/^https?:\/\//i.test(url.trim())) throw Object.assign(new Error('Give an http(s) URL'), { status: 400 });
    return audit(url.trim());
  },
  'GET /api/tokens': async () => ({ priceUsd: meta().priceUsd, live: false, quoteMode: 'dry', freeDeep: FREE_DEEP, tokens: await pay.tokens() }),
  'GET /api/chain': async () => chainStatus(),
  'GET /api/receipt': async (req, url) => readReceipt({ id: url.searchParams.get('id'), hash: url.searchParams.get('hash') }),
  'POST /api/quote': async (req) => {
    const { originAsset, refundTo } = await body(req);
    if (typeof originAsset !== 'string' || typeof refundTo !== 'string' || !refundTo.trim() || refundTo.length > 128) throw Object.assign(new Error('originAsset and refundTo are required'), { status: 400 });
    return pay.quote({ originAsset, refundTo: refundTo.trim() });
  },
  'POST /api/deep': async (req) => {
    const { repo, quoteId } = await body(req);
    const url = canonRepo(String(repo || '').trim());
    if (!url) throw Object.assign(new Error('Invalid repo URL'), { status: 400 });
    if (!quoteId || typeof quoteId !== 'string') throw Object.assign(new Error('Send quoteId from a dry 1Click quote. This build does not accept a deposit.'), { status: 400 });
    const snap = await snapshot(url);
    if (!snap.sha || !/^[0-9a-f]{40}$/.test(snap.sha)) throw Object.assign(new Error('The clone has no commit SHA to record'), { status: 422 });
    return settleDryReview({
      quoteId,
      repo: url,
      sha: snap.sha,
      run: async () => {
        const readme = readmeOf(snap.files)?.text || '';
        const [review, startup, readiness] = await Promise.all([
          deepReview(snap),
          startupLens(readme || [...snap.files.keys()].slice(0, 80).join('\n'), { kind: 'repo' }).catch(() => null),
          readinessFor(siteFor(snap)),
        ]);
        return { ...review, startup, startupLabel: STARTUP_LABEL, startupLink: STARTUP_LINK, readiness };
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
  '/og.png': ['public/og.png', 'image/png'],
  '/favicon.svg': ['public/favicon.svg', 'image/svg+xml'],
};

const indexCache = {};
createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const send = (code, obj, type = 'application/json') => {
    res.writeHead(code, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' });
    res.end(type === 'application/json' ? JSON.stringify(obj) : obj);
  };
  try {
    const method = req.method === 'HEAD' ? 'GET' : req.method;
    const route = routes[`${method} ${url.pathname}`];
    if (route) return send(200, await route(req, url));
    if (method === 'GET' && url.pathname === '/') {
      const raw = indexCache.raw || (indexCache.raw = await readFile(join(root, 'public/index.html'), 'utf8'));
      const html = raw
        .replaceAll('__NAME__', esc(PRODUCT.name))
        .replaceAll('__TAGLINE__', esc(PRODUCT.tagline))
        .replaceAll('__DISCLAIMER__', esc(PRODUCT.disclaimer))
        .replaceAll('__URL__', esc(PRODUCT.url))
        .replaceAll('__REPO__', esc(PRODUCT.repo))
        .replaceAll('__PRICE__', esc(String(meta().priceUsd)));
      return send(200, html, 'text/html; charset=utf-8');
    }
    if (method === 'GET' && url.pathname === '/robots.txt') {
      return send(200, `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${PRODUCT.url}/sitemap.xml\n`, 'text/plain; charset=utf-8');
    }
    if (method === 'GET' && url.pathname === '/sitemap.xml') {
      return send(200, `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${PRODUCT.url}/</loc><changefreq>hourly</changefreq></url>\n  <url><loc>${PRODUCT.url}/llms.txt</loc></url>\n</urlset>\n`, 'application/xml; charset=utf-8');
    }
    if (method === 'GET' && (url.pathname === '/verify' || url.pathname === '/verify/')) {
      const chain = chainStatus();
      const raw = await readFile(join(root, 'public/verify.html'), 'utf8');
      const html = raw
        .replaceAll('__NAME__', esc(PRODUCT.name))
        .replaceAll('__CONTRACT__', esc(chain.contractId || ''))
        .replaceAll('__RPC__', esc(chain.rpcUrl))
        .replaceAll('__EXPLORER__', esc(chain.explorerAccount || ''));
      return send(200, html, 'text/html; charset=utf-8');
    }
    if (method === 'GET' && url.pathname === '/llms.txt') {
      const raw = await readFile(join(root, 'public/llms.txt'), 'utf8');
      return send(200, raw.replaceAll('__NAME__', PRODUCT.name).replaceAll('__TAGLINE__', PRODUCT.tagline).replaceAll('__DISCLAIMER__', PRODUCT.disclaimer).replaceAll('__URL__', PRODUCT.url).replaceAll('__REPO__', PRODUCT.repo).replaceAll('__PRICE__', String(meta().priceUsd)), 'text/plain; charset=utf-8');
    }
    const file = FILES[url.pathname];
    if (method === 'GET' && file) return send(200, await readFile(join(root, file[0])), file[1]);
    send(404, { error: 'Not found' });
  } catch (e) {
    if (!e.status) console.error(e);
    send(e.status || 500, { error: e.status ? e.message : 'Internal error' });
  }
}).listen(PORT, '0.0.0.0', () => {
  const chain = chainStatus();
  console.log(`${PRODUCT.name} on http://localhost:${PORT}  quotes:dry  chain:${chain.configured ? chain.contractId : 'off'}  deep:${process.env.NEAR_AI_API_KEY ? 'on' : 'off'}  scan:${scanner ? 'on' : 'off'}`);
});
