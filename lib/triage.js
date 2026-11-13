import { canonRepo } from './match.js';
import { validRepo } from './repo.js';

export function parseRepoList(text, { limit = 20 } = {}) {
  const seen = new Map();
  const order = [];
  for (const m of String(text || '').matchAll(/https:\/\/github\.com\/[\w.-]+\/[\w.-]+/gi)) {
    const url = canonRepo(m[0]);
    if (!url || !validRepo(url)) continue;
    const key = url.toLowerCase();
    if (seen.has(key)) { seen.get(key).copies += 1; continue; }
    const item = { repo: url, copies: 1 };
    seen.set(key, item);
    order.push(item);
  }
  const capped = order.slice(0, limit);
  return {
    items: capped.map((i) => ({ repo: i.repo, duplicate: i.copies > 1, copies: i.copies })),
    overflow: Math.max(0, order.length - limit),
    total: order.length,
  };
}

export function triagePriority(item) {
  if (item.error) return 100;
  const fails = new Set((item.fixes || []).filter((f) => f.level === 'fail').map((f) => f.id));
  let p = 0;
  if (fails.has('secrets')) p = Math.max(p, 90);
  if (fails.has('license')) p = Math.max(p, 80);
  if (fails.has('commands-resolve')) p = Math.max(p, 70);
  if (fails.has('window')) p = Math.max(p, 60);
  if (fails.size) p = Math.max(p, 50);
  if (item.duplicate || (item.directoryNames || []).length > 1) p = Math.max(p, 45);
  if ((item.warns || 0) > 0) p = Math.max(p, 20);
  return p;
}

export function triageReason(item) {
  if (item.error) return 'Will not clone';
  const fails = new Set((item.fixes || []).filter((f) => f.level === 'fail').map((f) => f.id));
  if (fails.has('secrets')) return 'Possible secrets';
  if (fails.has('license')) return 'No license';
  if (fails.has('commands-resolve')) return 'README commands do not resolve';
  if (fails.has('window')) return 'Outside the hackathon window';
  if (fails.size) return (item.fixes || []).find((f) => f.level === 'fail')?.title || 'Rule failure';
  if (item.duplicate || (item.directoryNames || []).length > 1) return 'Duplicate';
  if ((item.warns || 0) > 0) return 'Warnings';
  return 'No rule failures';
}

export function orderTriage(items) {
  return [...(items || [])].sort((a, b) => {
    const d = triagePriority(b) - triagePriority(a);
    if (d) return d;
    if ((b.fails || 0) !== (a.fails || 0)) return (b.fails || 0) - (a.fails || 0);
    return String(a.repo || '').localeCompare(String(b.repo || ''));
  }).map((item) => ({ ...item, priority: triagePriority(item), reason: triageReason(item) }));
}
