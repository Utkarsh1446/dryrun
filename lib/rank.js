import { score as defaultScore } from './checks.js';
import { sameRepo } from './match.js';

const FIX_ORDER = ['secrets', 'license', 'commands-resolve', 'window', 'readme', 'run-steps', 'disclosure', 'near-role', 'env-example', 'lockfile', 'tests', 'marketing'];

export function summarise(results, scoreFn = defaultScore) {
  const s = scoreFn(results || []);
  const flag = (id) => (results || []).find((r) => r.id === id)?.level || null;
  const fixes = (results || [])
    .filter((r) => r.level !== 'pass')
    .map((r) => ({ id: r.id, level: r.level, title: r.title, detail: r.detail, fix: r.fix || '' }))
    .sort((a, b) => {
      const la = a.level === 'fail' ? 0 : 1;
      const lb = b.level === 'fail' ? 0 : 1;
      if (la !== lb) return la - lb;
      const ia = FIX_ORDER.indexOf(a.id);
      const ib = FIX_ORDER.indexOf(b.id);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
  return {
    ...s,
    flags: {
      license: flag('license'),
      secrets: flag('secrets'),
      window: flag('window'),
      commands: flag('commands-resolve'),
      readme: flag('readme'),
    },
    fixes,
  };
}

// Higher rule score first. Ties break toward fewer failures, then fewer warnings, then name.
export function compareEntries(a, b) {
  if (a.score !== b.score) return b.score - a.score;
  if ((a.fails || 0) !== (b.fails || 0)) return (a.fails || 0) - (b.fails || 0);
  if ((a.warns || 0) !== (b.warns || 0)) return (a.warns || 0) - (b.warns || 0);
  return String(a.name || '').localeCompare(String(b.name || ''));
}

// Name is only a display tie-break. It does not move the estimated rank.
export function isAhead(a, b) {
  if ((a.score || 0) !== (b.score || 0)) return (a.score || 0) > (b.score || 0);
  if ((a.fails || 0) !== (b.fails || 0)) return (a.fails || 0) < (b.fails || 0);
  if ((a.warns || 0) !== (b.warns || 0)) return (a.warns || 0) < (b.warns || 0);
  return false;
}

export function rankBoard(entries) {
  const ranked = (entries || [])
    .filter((e) => typeof e.score === 'number' && e.repo && !e.cloneError)
    .map((e) => ({ ...e, tracks: [...(e.tracks || [])], trackRanks: {} }))
    .sort(compareEntries);
  let rank = 1;
  ranked.forEach((e, i) => {
    if (i > 0 && isAhead(ranked[i - 1], e)) rank = i + 1;
    e.rank = rank;
  });
  const byTrack = new Map();
  for (const e of ranked) {
    for (const t of e.tracks) {
      if (!byTrack.has(t)) byTrack.set(t, []);
      byTrack.get(t).push(e);
    }
  }
  for (const [t, list] of byTrack) {
    let trackRank = 1;
    list.forEach((e, i) => {
      if (i > 0 && isAhead(list[i - 1], e)) trackRank = i + 1;
      e.trackRanks[t] = trackRank;
    });
  }
  return { ranked, scoredCount: ranked.length };
}

// Rank among other scored repos. The caller's own repo URL is not counted twice.
// The model score is never an input: order is the deterministic rule score only.
export function placeUser(user, ranked, repoUrl) {
  const mine = repoUrl || user.repo || '';
  const others = (ranked || []).filter((e) => !sameRepo(e.repo, mine));
  const better = (list) => list.filter((e) => isAhead(e, user)).length
  const tracks = {};
  for (const t of user.tracks || []) {
    const inTrack = others.filter((e) => (e.tracks || []).includes(t));
    tracks[t] = { rank: better(inTrack) + 1, of: inTrack.length + 1 };
  }
  return {
    rank: better(others) + 1,
    of: others.length + 1,
    tracks,
    aiUsedForRank: false,
    note: others.length
      ? 'Estimate only. This rank is among scored public repos, not the whole directory, and it is not an official result.'
      : 'Estimate only. No other scored repos yet. This rank is only against an empty board.',
  };
}
