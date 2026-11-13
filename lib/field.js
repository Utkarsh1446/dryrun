import { PRODUCT } from './brand.js';
import { clusterProjects, trackStats } from './cluster.js';
import { canonRepo } from './match.js';
import { rankBoard } from './rank.js';
import { SCORE_VERSION } from './assess.js';

export function buildField({ adapter, directory, snapshots, matches, scores, scan }) {
  const projects = directory?.projects || [];
  const ready = Boolean(directory?.fetchedAt);
  const tracks = trackStats(projects, adapter?.tracks || []);
  const clusters = clusterProjects(projects);
  const rows = projects.map((p) => {
    const m = matches?.[p.id] || null;
    const repo = m?.repo ? canonRepo(m.repo) : null;
    const raw = repo ? scores?.[repo.toLowerCase()] : null;
    // Scores from an older scoring method are not mixed into the board; they are re-read in the background.
    const sc = raw && (raw.error || raw.v === SCORE_VERSION) ? raw : null;
    const cloneError = sc?.error || null;
    return {
      id: p.id,
      name: p.name,
      tracks: p.tracks || [],
      demoUrl: p.demoUrl || null,
      repo,
      confidence: m?.confidence || null,
      matchSource: m?.source || null,
      matchNote: m?.note || null,
      score: typeof sc?.score === 'number' && !cloneError ? sc.score : null,
      fails: sc?.fails ?? null,
      warns: sc?.warns ?? null,
      verdict: sc?.verdict || null,
      flags: sc?.flags || null,
      fixes: (sc?.fixes || []).slice(0, 4).map(({ level, title }) => ({ level, title })),
      ai: sc?.ai || null,
      cloneError,
      scoredAt: sc?.at || null,
    };
  });
  const repoCounts = new Map();
  for (const row of rows) if (row.repo) repoCounts.set(row.repo.toLowerCase(), (repoCounts.get(row.repo.toLowerCase()) || 0) + 1);
  for (const row of rows) row.sharedRepo = Boolean(row.repo && repoCounts.get(row.repo.toLowerCase()) > 1);
  const { ranked } = rankBoard(rows);
  const board = ranked.map((e) => ({
    id: e.id,
    name: e.name,
    tracks: e.tracks,
    demoUrl: rows.find((r) => r.id === e.id)?.demoUrl || null,
    repo: e.repo,
    confidence: e.confidence,
    matchSource: e.matchSource,
    matchNote: e.matchNote,
    score: e.score,
    fails: e.fails,
    warns: e.warns,
    verdict: e.verdict,
    flags: e.flags,
    fixes: e.fixes,
    ai: e.ai ? { scores: e.ai.scores || null, note: e.ai.note || null } : null,
    rank: e.rank,
    trackRanks: e.trackRanks,
    sharedRepo: e.sharedRepo,
  }));
  const matched = rows.filter((r) => r.repo);
  return {
    ready,
    speculation: true,
    disclaimer: PRODUCT.disclaimer,
    hackathon: adapter ? { id: adapter.id, name: adapter.name } : null,
    total: directory?.total || 0,
    collected: projects.length,
    fetchedAt: directory?.fetchedAt || null,
    growth: snapshots || [],
    tracks: tracks.tracks,
    clusters,
    coverage: {
      projects: projects.length,
      withDemo: projects.filter((p) => p.demoUrl).length,
      demoChecked: projects.filter((p) => matches?.[p.id]?.checkedDemo).length,
      matched: matched.length,
      high: matched.filter((r) => r.confidence === 'high').length,
      medium: matched.filter((r) => r.confidence === 'medium').length,
      low: matched.filter((r) => r.confidence === 'low').length,
      scored: board.length,
      cloneFailed: rows.filter((r) => r.cloneError).length,
      unmatched: projects.length - matched.length,
      sharedRepos: [...repoCounts.values()].filter((n) => n > 1).length,
    },
    scan: scan || { phase: 'starting' },
    board,
    // kept for rank placement; not sent on the wire by the server
    _ranked: ranked,
  };
}

export function overviewFrom(field, extra = {}) {
  return {
    ready: field.ready,
    speculation: true,
    disclaimer: field.disclaimer,
    hackathon: field.hackathon,
    total: field.ready ? field.total : null,
    collected: field.ready ? field.collected : null,
    fetchedAt: field.fetchedAt,
    growth: field.growth,
    tracks: field.ready ? field.tracks : [],
    clusters: {
      tokens: (field.clusters?.tokens || []).slice(0, 8).map(({ label, count }) => ({ label, count })),
      names: (field.clusters?.names || []).slice(0, 6).map(({ label, count, names }) => ({ label, count, names })),
    },
    coverage: field.ready ? field.coverage : null,
    scan: field.scan,
    ...extra,
  };
}
