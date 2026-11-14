// Display mask for the guessed leaderboard. The default API response omits team names and repo URLs.
// An alias is a hash prefix, not a promise that a reader with the public directory cannot rematch a score.
import { createHash } from 'node:crypto';

export const ESTIMATE_HIDDEN = 'Estimate only. This is not an official ranking and not a judge score. Team and repository names are anonymised.';
export const ESTIMATE_SHOWN = 'Estimate only. This is not an official ranking and not a judge score. Names are shown because this request asked for them.';

export function aliasFrom(value) {
  return createHash('sha256').update(String(value || '')).digest('hex').slice(0, 6);
}

export function anonymiseBoardRow(row) {
  const team = `team-${aliasFrom(row.id || row.name)}`;
  return {
    id: team,
    name: team,
    tracks: row.tracks,
    demoUrl: null,
    repo: null,
    repoAlias: row.repo ? `repo-${aliasFrom(row.repo)}` : null,
    confidence: row.confidence,
    matchSource: row.matchSource,
    matchNote: null,
    score: row.score,
    fails: row.fails,
    warns: row.warns,
    verdict: row.verdict,
    flags: row.flags,
    fixes: row.fixes,
    ai: row.ai,
    rank: row.rank,
    trackRanks: row.trackRanks,
    sharedRepo: row.sharedRepo,
    anonymised: true,
  };
}

export function publicBoard(rows, { names = false } = {}) {
  const list = rows || [];
  if (names) return list.map((row) => ({ ...row, anonymised: false, repoAlias: null }));
  return list.map(anonymiseBoardRow);
}
