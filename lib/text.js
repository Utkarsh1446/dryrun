// Shared name normalisation for clustering, idea overlap, and repo-name matching.
export const STOP = new Set('a an the for of on and to with in your from by at near hackathon app dapp project using use based via into over per its this that are was were be is as or if not no yes you our their'.split(' '));

export function normName(s) {
  return String(s || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokens(s) {
  return normName(s).split(' ').filter((t) => t.length >= 3 && !STOP.has(t));
}

export function jaccard(a, b) {
  const A = new Set(a);
  const B = new Set(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}
