import { PRODUCT } from './brand.js';
import { criteriaScore } from './ai.js';
import { crawlDirectory, nextSnapshots } from './directory.js';
import { buildField } from './field.js';
import { assignSearchHits, canonRepo, demoPostApiUrl, needsDemoFetch, reposFromTweet, searchGithub, tweetHasBody } from './match.js';
import { summarise } from './rank.js';
import { tokens } from './text.js';

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = 'DryRun/0.2 (hackathon directory monitor)';

async function getJson(url, fetchImpl) {
  try {
    const r = await fetchImpl(url, {
      redirect: 'manual',
      headers: { accept: 'application/json', 'user-agent': UA },
      signal: AbortSignal.timeout(20_000),
    });
    if (r.status === 429) return { rateLimited: true };
    if (r.status >= 300 && r.status < 400) return { error: 'redirect refused' };
    if (!r.ok) return { error: `HTTP ${r.status}` };
    const json = await r.json().catch(() => null);
    if (!json || (typeof json === 'object' && !Object.keys(json).length)) return { error: 'empty' };
    return { json };
  } catch (e) {
    return { error: e.name === 'TimeoutError' ? 'timeout' : 'fetch failed' };
  }
}

async function readDemo(demoUrl, fetchImpl) {
  const apis = demoPostApiUrl(demoUrl);
  if (!apis) return { repos: [], error: 'Demo URL is not an X status link' };
  const first = await getJson(apis.syndication, fetchImpl);
  if (first.rateLimited) return { rateLimited: true };
  if (first.json && tweetHasBody(first.json)) return { repos: reposFromTweet(first.json), error: null };
  const second = await getJson(apis.fallback, fetchImpl);
  if (second.rateLimited) return { rateLimited: true };
  if (second.json && (tweetHasBody(second.json) || reposFromTweet(second.json).length)) {
    return { repos: reposFromTweet(second.json), error: null };
  }
  return { repos: [], error: first.error || second.error || 'Demo post could not be read' };
}

export function createScanner({
  adapter,
  rulebook,
  store,
  snapshot,
  fetchImpl = fetch,
  log = () => {},
  gapMs = 200,
  tweetGapMs = 400,
  refreshMs = 10 * 60 * 1000,
  now = () => new Date().toISOString(),
} = {}) {
  const status = {
    phase: 'starting',
    directory: null,
    matching: null,
    scoring: null,
    error: null,
    startedAt: now(),
  };
  let directory = { total: 0, projects: [], fetchedAt: null };
  let snapshots = [];
  let matches = {};
  let tweets = {};
  let scores = {};
  let rev = 0;
  let stopped = false;
  let githubPausedUntil = 0;
  const loop = run();

  function bump() { rev += 1; }
  function projects() { return directory.projects; }

  function coverageCounts() {
    const withDemo = directory.projects.filter((p) => p.demoUrl);
    const done = withDemo.filter((p) => !needsDemoFetch(tweets[p.demoUrl], Date.now())).length;
    const repos = new Set();
    for (const p of directory.projects) {
      const url = canonRepo(matches[p.id]?.repo || '');
      if (url) repos.add(url.toLowerCase());
    }
    let scored = 0;
    for (const url of repos) if (scores[url] && !scores[url].error && typeof scores[url].score === 'number') scored += 1;
    return { demoDone: done, demoTotal: withDemo.length, repos: repos.size, scored };
  }

  function refreshStatus() {
    const c = coverageCounts();
    status.matching = { done: c.demoDone, total: c.demoTotal };
    status.scoring = { done: c.scored, total: c.repos };
  }

  async function load() {
    const saved = await store.read('directory.json', null);
    if (saved?.projects) directory = saved;
    snapshots = await store.read('snapshots.json', []);
    const savedMatches = await store.read('matches.json', { byId: {}, tweets: {} });
    matches = savedMatches.byId || {};
    tweets = savedMatches.tweets || {};
    scores = await store.read('scores.json', {});
    bump();
    refreshStatus();
  }

  async function persistDirectory() {
    await store.write('directory.json', directory);
    await store.write('snapshots.json', snapshots);
  }
  async function persistMatches() {
    await store.write('matches.json', { byId: matches, tweets });
  }
  async function persistScores() {
    await store.write('scores.json', scores);
  }

  async function refreshDirectory() {
    status.phase = 'directory';
    const result = await crawlDirectory(adapter, {
      gapMs,
      fetchImpl,
      onPage: (page, pages, total) => { status.directory = { page, pages, total }; },
    });
    directory = { total: result.total, projects: result.projects, fetchedAt: result.fetchedAt };
    const byTrack = {};
    for (const t of adapter.tracks) byTrack[t.id] = directory.projects.filter((p) => (p.tracks || []).includes(t.id)).length;
    snapshots = nextSnapshots(snapshots, { at: result.fetchedAt, total: result.total, byTrack });
    const pages = Math.max(1, Math.ceil(result.total / (result.pageSize || 1)));
    status.directory = { page: pages, pages, total: result.total };
    status.error = null;
    bump();
    refreshStatus();
    await persistDirectory();
    log(`${PRODUCT.name}: directory ${result.projects.length} entries (reported total ${result.total})`);
  }

  function pendingDemos() {
    return directory.projects.filter((p) => p.demoUrl && needsDemoFetch(tweets[p.demoUrl], Date.now()));
  }

  function applyDemo(p, read) {
    const at = now();
    const repos = (read.repos || []).map((u) => canonRepo(u)).filter(Boolean);
    if (repos.length) {
      matches[p.id] = {
        repo: repos[0],
        alt: repos.slice(1, 4),
        confidence: 'high',
        source: 'demo-post',
        note: 'First GitHub link in the public demo post. It may be a dependency, not the submission repository.',
        at,
        checkedDemo: true,
      };
      return;
    }
    const prev = matches[p.id];
    if (prev?.repo && prev.source === 'github-search') {
      matches[p.id] = { ...prev, checkedDemo: true };
      return;
    }
    matches[p.id] = {
      repo: null,
      confidence: null,
      source: 'demo-post',
      note: read.error ? `Demo post was not read (${read.error}).` : 'Demo post has no GitHub link.',
      at,
      checkedDemo: true,
    };
  }

  async function matchSome(n) {
    const batch = pendingDemos().slice(0, n);
    if (!batch.length) return false;
    status.phase = 'matching';
    for (const p of batch) {
      if (stopped) return true;
      const read = await readDemo(p.demoUrl, fetchImpl);
      if (read.rateLimited) {
        status.error = 'Demo-post host rate-limited; backing off.';
        await delay(60_000);
        return true;
      }
      tweets[p.demoUrl] = { at: now(), repos: read.repos || [], error: read.error || null };
      applyDemo(p, read);
      bump();
      refreshStatus();
      if (tweetGapMs) await delay(tweetGapMs);
    }
    await persistMatches();
    const c = coverageCounts();
    if (c.demoDone === c.demoTotal || c.demoDone % 60 === 0) {
      log(`${PRODUCT.name}: demo posts ${c.demoDone}/${c.demoTotal}, repos matched ${c.repos}`);
    }
    return true;
  }

  function searchEligible() {
    return directory.projects.filter((p) => {
      if (matches[p.id]?.repo) return false;
      if (matches[p.id]?.searchTried) return false;
      if (p.demoUrl && needsDemoFetch(tweets[p.demoUrl], Date.now())) return false;
      return true;
    });
  }

  async function searchBatch() {
    if (Date.now() < githubPausedUntil) return false;
    const eligible = searchEligible();
    if (!eligible.length) return false;
    status.phase = 'matching';
    const found = await searchGithub('NEARHackathon', { fetchImpl });
    if (found.rateLimited) {
      githubPausedUntil = Date.now() + 10 * 60 * 1000;
      status.error = 'GitHub search is rate-limited. Demo-post matching continues.';
      return false;
    }
    const assigned = assignSearchHits(eligible.map((p) => ({ id: p.id, name: p.name })), found.items || []);
    let n = 0;
    for (const hit of assigned) {
      if (matches[hit.id]?.repo) continue;
      matches[hit.id] = {
        repo: hit.url,
        confidence: hit.confidence,
        source: 'github-search',
        note: 'GitHub repository search by project name. This can be the wrong repository.',
        at: now(),
        checkedDemo: Boolean(tweets[directory.projects.find((p) => p.id === hit.id)?.demoUrl || '']),
      };
      n += 1;
    }
    if (n) {
      bump();
      refreshStatus();
      await persistMatches();
      log(`${PRODUCT.name}: GitHub search attached ${n} repositories`);
    }
    return n > 0;
  }

  async function searchNames(limit) {
    if (Date.now() < githubPausedUntil) return false;
    const queue = searchEligible().slice(0, limit);
    if (!queue.length) return false;
    status.phase = 'matching';
    let n = 0;
    for (const p of queue) {
      if (stopped) break;
      const words = [...new Set(tokens(p.name))].slice(0, 3).join(' ');
      if (words.length < 4) {
        matches[p.id] = { ...(matches[p.id] || { repo: null }), searchTried: true, at: now() };
        continue;
      }
      await delay(7_000);
      const found = await searchGithub(`${words} NEAR`, { fetchImpl });
      if (found.rateLimited) {
        githubPausedUntil = Date.now() + 10 * 60 * 1000;
        status.error = 'GitHub search is rate-limited. Demo-post matching continues.';
        break;
      }
      const hit = assignSearchHits([{ id: p.id, name: p.name }], found.items || [])[0];
      const prev = matches[p.id] || { repo: null };
      if (!hit || prev.repo) {
        matches[p.id] = { ...prev, searchTried: true, at: now() };
        continue;
      }
      matches[p.id] = {
        repo: hit.url,
        confidence: hit.confidence,
        source: 'github-search',
        note: 'GitHub repository search by project name. This can be the wrong repository.',
        at: now(),
        checkedDemo: Boolean(p.demoUrl && tweets[p.demoUrl]),
        searchTried: true,
      };
      n += 1;
    }
    bump();
    refreshStatus();
    await persistMatches();
    return n > 0;
  }

  async function scoreSome(n) {
    const queue = [];
    const seen = new Set();
    for (const p of directory.projects) {
      const url = canonRepo(matches[p.id]?.repo || '');
      if (!url) continue;
      const key = url.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const prev = scores[key];
      const age = prev ? Date.now() - Date.parse(prev.at) : Infinity;
      if (prev && !prev.error && age < 12 * 60 * 60 * 1000) continue;
      if (prev?.error && age < 30 * 60 * 1000) continue;
      queue.push(url);
    }
    refreshStatus();
    if (!queue.length) return false;
    status.phase = 'scoring';
    for (const repo of queue.slice(0, n)) {
      if (stopped) return true;
      const key = repo.toLowerCase();
      try {
        const snap = await snapshot(repo);
        const summary = summarise(rulebook.checkRepo(snap), rulebook.score);
        let ai = null;
        if (process.env.DRYRUN_AI_BOARD === '1') ai = await criteriaScore(snap);
        scores[key] = { ...summary, ai, at: now(), error: null };
        log(`${PRODUCT.name}: scored ${repo} ${summary.score}`);
      } catch (e) {
        scores[key] = { at: now(), error: e.status ? e.message : 'Could not read the repository', score: null };
        log(`${PRODUCT.name}: score failed ${repo}`);
      }
      bump();
      refreshStatus();
      await persistScores();
    }
    return true;
  }

  function getField() {
    return buildField({
      adapter,
      directory,
      snapshots,
      matches,
      scores,
      scan: { ...status, directory: status.directory ? { ...status.directory } : null, matching: status.matching ? { ...status.matching } : null, scoring: status.scoring ? { ...status.scoring } : null },
    });
  }

  function namesForRepo(url) {
    const want = (canonRepo(url) || '').toLowerCase();
    if (!want) return [];
    return directory.projects
      .filter((p) => (canonRepo(matches[p.id]?.repo || '') || '').toLowerCase() === want)
      .map((p) => p.name);
  }

  async function run() {
    try { await load(); } catch (e) { status.error = 'Could not read the cache'; log(e.message || e); }
    while (!stopped) {
      try {
        await refreshDirectory();
        const cycleStart = Date.now();
        let batchDone = false;
        let namesDone = false;
        while (!stopped && Date.now() - cycleStart < refreshMs) {
          const didMatch = await matchSome(12);
          if (!batchDone && (searchEligible().length || !pendingDemos().length)) {
            await searchBatch();
            batchDone = true;
          }
          const didScore = await scoreSome(1);
          if (!pendingDemos().length && !namesDone) { await searchNames(6); namesDone = true; }
          if (!didMatch && !didScore && namesDone) {
            status.phase = 'idle';
            refreshStatus();
            const left = refreshMs - (Date.now() - cycleStart);
            if (left > 1000) await delay(Math.min(20_000, left));
          }
        }
      } catch (e) {
        status.phase = 'error';
        status.error = 'Directory read failed. The last saved copy is still shown.';
        log(`${PRODUCT.name}: ${e.message || e}`);
        await delay(8_000);
      }
    }
  }

  return {
    status: () => ({ ...status }),
    getField,
    projects,
    namesForRepo,
    stop() { stopped = true; return loop; },
  };
}
