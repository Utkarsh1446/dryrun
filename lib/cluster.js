import { jaccard, normName, tokens } from './text.js';

// Token clusters (many projects share a distinctive word) and near-duplicate names.
export function clusterProjects(projects, { minSize = 3, maxShare = 0.12 } = {}) {
  const items = (projects || []).map((p, i) => ({
    i, id: p.id, name: p.name, norm: normName(p.name), tokens: tokens(p.name),
  }));
  const n = items.length || 1;
  const byToken = new Map();
  for (const item of items) {
    for (const t of new Set(item.tokens)) {
      if (!byToken.has(t)) byToken.set(t, []);
      byToken.get(t).push(item);
    }
  }
  const tokenClusters = [];
  for (const [label, members] of byToken) {
    if (members.length < minSize) continue;
    if (members.length / n > maxShare) continue;
    tokenClusters.push({
      kind: 'token',
      label,
      count: members.length,
      names: members.map((m) => m.name).slice(0, 12),
      ids: members.map((m) => m.id),
    });
  }
  tokenClusters.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  const byNorm = new Map();
  for (const item of items) {
    if (!item.norm) continue;
    if (!byNorm.has(item.norm)) byNorm.set(item.norm, []);
    byNorm.get(item.norm).push(item);
  }
  const duplicateNames = [];
  for (const [label, members] of byNorm) {
    if (members.length < 2) continue;
    duplicateNames.push({
      kind: 'name',
      label,
      count: members.length,
      names: members.map((m) => m.name),
      ids: members.map((m) => m.id),
    });
  }
  duplicateNames.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  return {
    tokens: tokenClusters.slice(0, 24),
    names: duplicateNames.slice(0, 24),
    near: nearDuplicateGroups(items).slice(0, 16),
  };
}

function nearDuplicateGroups(items) {
  const parent = items.map((_, i) => i);
  const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const union = (a, b) => { parent[find(a)] = find(b); };
  const index = new Map();
  for (const item of items) {
    for (const t of new Set(item.tokens)) {
      if (!index.has(t)) index.set(t, []);
      index.get(t).push(item);
    }
  }
  const seen = new Set();
  for (const list of index.values()) {
    if (list.length < 2 || list.length > 30) continue;
    for (let a = 0; a < list.length; a++) {
      for (let b = a + 1; b < list.length; b++) {
        const i = list[a].i;
        const j = list[b].i;
        const key = i < j ? `${i}:${j}` : `${j}:${i}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (list[a].norm === list[b].norm) continue;
        if (jaccard(list[a].tokens, list[b].tokens) >= 0.67) union(i, j);
      }
    }
  }
  const groups = new Map();
  for (let i = 0; i < items.length; i++) {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(items[i]);
  }
  const out = [];
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    const norms = new Set(members.map((m) => m.norm));
    if (norms.size < 2) continue;
    out.push({
      kind: 'near',
      label: members[0].norm,
      count: members.length,
      names: members.map((m) => m.name).slice(0, 8),
      ids: members.map((m) => m.id),
    });
  }
  out.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  return out;
}

export function trackStats(projects, tracks) {
  const list = projects || [];
  const total = list.length;
  const rows = (tracks || []).map((t) => {
    const id = t.id || t;
    const label = t.label || id;
    const count = list.filter((p) => (p.tracks || []).includes(id)).length;
    const single = list.filter((p) => (p.tracks || []).length === 1 && p.tracks[0] === id).length;
    const share = total ? count / total : 0;
    const room = share >= 0.25 ? 'crowded' : share >= 0.12 ? 'busy' : 'open';
    return { id, label, count, single, share, room };
  });
  rows.sort((a, b) => a.count - b.count || a.label.localeCompare(b.label));
  return { total, tracks: rows };
}

export function ideaOverlap(text, projects, { limit = 8 } = {}) {
  const q = [...new Set(tokens(text))];
  if (!q.length) return [];
  const qset = new Set(q);
  const scored = [];
  for (const p of projects || []) {
    const all = new Set([...tokens(p.name), ...tokens(p.blurb || '')]);
    const shared = q.filter((t) => all.has(t));
    if (!shared.length) continue;
    scored.push({
      id: p.id,
      name: p.name,
      tracks: p.tracks || [],
      score: shared.length / qset.size,
      shared,
    });
  }
  scored.sort((a, b) => b.score - a.score || String(a.name).localeCompare(String(b.name)));
  return scored.slice(0, limit);
}

export function quietTracks(trackRows, limit = 3) {
  return [...(trackRows || [])].sort((a, b) => a.count - b.count).slice(0, limit);
}
