const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchPageRetry(adapter, page, fetchImpl, sleep, gapMs) {
  let last;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await adapter.fetchPage(page, fetchImpl);
    } catch (e) {
      last = e;
      await sleep(Math.max(gapMs, 50) * 2 ** attempt);
    }
  }
  throw last;
}

export function dedupeProjects(projects) {
  const seen = new Set();
  const out = [];
  for (const p of projects || []) {
    if (!p?.id || seen.has(p.id)) continue;
    seen.add(p.id);
    out.push({
      id: String(p.id),
      name: String(p.name || ''),
      tracks: Array.isArray(p.tracks) ? p.tracks.map(String) : [],
      demoUrl: p.demoUrl || null,
    });
  }
  return out;
}

// One page at a time. A 429/5xx from the adapter is retried with backoff before the next page starts.
export async function crawlDirectory(adapter, { gapMs = 200, sleep = delay, fetchImpl, onPage } = {}) {
  const first = await fetchPageRetry(adapter, 1, fetchImpl, sleep, gapMs);
  const pageSize = first.pageSize || first.projects?.length || 1;
  const pages = Math.max(1, Math.ceil((first.total || 0) / pageSize));
  if (onPage) onPage(1, pages, first.total || 0);
  const all = [...(first.projects || [])];
  for (let p = 2; p <= pages; p++) {
    if (gapMs) await sleep(gapMs);
    const page = await fetchPageRetry(adapter, p, fetchImpl, sleep, gapMs);
    all.push(...(page.projects || []));
    if (onPage) onPage(p, pages, first.total || 0);
  }
  return {
    total: first.total || all.length,
    pageSize,
    projects: dedupeProjects(all),
    fetchedAt: new Date().toISOString(),
  };
}

export function nextSnapshots(prev, point) {
  const list = Array.isArray(prev) ? prev : [];
  const last = list[list.length - 1];
  const same = last && last.total === point.total && JSON.stringify(last.byTrack || {}) === JSON.stringify(point.byTrack || {});
  if (same) return list;
  return [...list, { at: point.at, total: point.total, byTrack: point.byTrack || {} }].slice(-400);
}
