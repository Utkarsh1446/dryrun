// A hackathon plugs in as a directory adapter plus a rulebook.
// The adapter fetches one page of public entries. The rulebook scores a repo.
// Colosseum (or anyone else) is another adapter with live:true once its directory URL exists.
export function defineAdapter(spec) {
  for (const key of ['id', 'name', 'tracks', 'fetchPage']) {
    if (spec?.[key] == null) throw new Error(`Adapter is missing ${key}`);
  }
  if (typeof spec.fetchPage !== 'function') throw new Error('Adapter fetchPage must be a function');
  if (!Array.isArray(spec.tracks)) throw new Error('Adapter tracks must be an array');
  return { live: false, source: '', ...spec };
}

export function liveAdapters(list) {
  return (list || []).filter((a) => a && a.live);
}
