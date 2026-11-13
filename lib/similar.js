// Idea similarity over the public directory: BM25 with corpus IDF, bigram boosts, and a floor on
// how much information a query carries. A sentence of filler and generic hackathon words cannot
// produce a strong match, because its own weight is tiny.
import { normName } from './text.js';

// Plain English filler. Never indexed.
export const STOPWORDS = new Set((
  'a an the and or but nor so yet for of on in at to from by with without into onto over under about above below ' +
  'is are was were be been being am do does did doing done have has had having will would shall should can could may might must ' +
  'i me my we us our you your he him his she her it its they them their this that these those there here what which who whom whose ' +
  'when where why how all any both each few more most other some such no not only own same than too very just also ' +
  'as if then else while because until again further once up down out off per via vs etc ie eg let lets like ' +
  'new make makes making made get gets getting got using use uses used one two first every anyone someone something thing things ' +
  'way ways lot lots really simple simply easy easily better best good great real now today still even much many well'
).split(' '));

// Words that describe most hackathon entries rather than any one of them. Kept, but down-weighted
// on top of their corpus IDF so a query made of them stays weak.
export const DOMAIN_GENERIC = new Set((
  'agent ai near web3 web protocol platform app application dapp build builder builders built onchain chain chains blockchain crypto ' +
  'decentralized decentralised smart contract contracts network system tool tools toolkit powered power autonomous based layer ' +
  'project hackathon solution service services framework open source user users people everyone world future next gen ' +
  'token tokens wallet wallets account accounts data api sdk infrastructure infra ecosystem community product products ' +
  'secure security fast faster cheap seamless intelligent intelligence automated automation manage management help helps ' +
  'enable enables allow allows create creates via across mainnet testnet'
).split(' '));

export function stem(t) {
  if (t.length > 4 && t.endsWith('ies')) return t.slice(0, -3) + 'y';
  if (t.length > 4 && t.endsWith('es') && /(ss|x|ch|sh)es$/.test(t)) return t.slice(0, -2);
  if (t.length > 3 && t.endsWith('s') && !t.endsWith('ss') && !t.endsWith('us')) return t.slice(0, -1);
  return t;
}

// Ordered content words. Two-letter acronyms that carry meaning are kept.
const KEEP_SHORT = new Set(['zk', 'tee', 'mpc', 'nft', 'dao', 'l2', 'p2p', 'ui', 'ux', 'kyc', 'rwa', 'dex', 'otc', 'fx']);
export function words(text) {
  return normName(text).split(' ')
    .filter((t) => t && !STOPWORDS.has(t) && (t.length >= 3 || KEEP_SHORT.has(t)) && !/^\d+$/.test(t))
    .map(stem);
}

export function grams(text) {
  const w = words(text);
  const bi = [];
  for (let i = 0; i + 1 < w.length; i++) {
    if (DOMAIN_GENERIC.has(w[i]) && DOMAIN_GENERIC.has(w[i + 1])) continue;
    bi.push(`${w[i]} ${w[i + 1]}`);
  }
  return { uni: w, bi };
}

const K1 = 1.2, B = 0.5;
export const GENERIC_WEIGHT = 0.3;
export const BIGRAM_BOOST = 1.6;
export const NAME_REPEAT = 2;
// A query must carry at least this much IDF mass to reach similarity 1.0. About three distinctive words.
export const MIN_INFO = 9;
// Long descriptions are not penalised past this much query mass (a directory name is short).
export const MAX_INFO = 30;

export function buildIndex(projects) {
  const docs = [];
  const df = new Map();
  for (const p of projects || []) {
    const name = grams(p.name || '');
    const blurb = grams(p.blurb || '');
    const terms = [];
    for (let r = 0; r < NAME_REPEAT; r++) terms.push(...name.uni, ...name.bi);
    terms.push(...blurb.uni, ...blurb.bi);
    const tf = new Map();
    for (const t of terms) tf.set(t, (tf.get(t) || 0) + 1);
    for (const t of tf.keys()) df.set(t, (df.get(t) || 0) + 1);
    docs.push({ id: p.id, name: p.name, blurb: p.blurb || '', tracks: p.tracks || [], tf, len: terms.length });
  }
  const avgdl = docs.reduce((s, d) => s + d.len, 0) / (docs.length || 1) || 1;
  return { docs, df, n: docs.length, avgdl };
}

export function idf(index, term) {
  const df = index.df.get(term) || 0;
  return Math.log(1 + (index.n - df + 0.5) / (df + 0.5));
}

function termWeight(index, term) {
  const parts = term.split(' ');
  const generic = parts.every((p) => DOMAIN_GENERIC.has(p));
  const base = idf(index, term) * (generic ? GENERIC_WEIGHT : 1);
  if (parts.length < 2) return base;
  // A phrase is worth a boost only when both words are specific.
  return parts.some((p) => DOMAIN_GENERIC.has(p)) ? base : base * BIGRAM_BOOST;
}

// Returns [{ id, name, tracks, sim (0..1), lexical, why: { terms, phrases, info } }], best first.
export function searchIdea(index, text, { limit = 20, min = 0.08 } = {}) {
  const q = grams(text);
  const qTerms = [...new Set([...q.uni, ...q.bi])];
  if (!qTerms.length || !index?.n) return { info: 0, specific: false, results: [] };
  const weights = new Map(qTerms.map((t) => [t, termWeight(index, t)]));
  // Phrases the directory never uses cannot be matched, so they do not raise the bar.
  const info = qTerms.filter((t) => !t.includes(' ') || index.df.has(t)).reduce((a, t) => a + weights.get(t), 0);
  const denom = Math.min(MAX_INFO, Math.max(info, MIN_INFO));
  const isGeneric = (t) => t.split(' ').every((p) => DOMAIN_GENERIC.has(p));
  const specificInfo = qTerms.filter((t) => !t.includes(' ') && !isGeneric(t)).reduce((a, t) => a + weights.get(t), 0);
  const out = [];
  for (const d of index.docs) {
    let s = 0;
    const hits = [];
    for (const t of qTerms) {
      const tf = d.tf.get(t);
      if (!tf) continue;
      const norm = (tf * (K1 + 1)) / (tf + K1 * (1 - B + (B * d.len) / index.avgdl)) / (K1 + 1) * 2;
      const c = weights.get(t) * Math.min(1, norm);
      s += c;
      hits.push({ term: t, weight: c });
    }
    if (!hits.length) continue;
    // A match on generic words alone is not a match.
    if (!hits.some((h) => !h.term.split(' ').every((p) => DOMAIN_GENERIC.has(p)))) continue;
    const sim = Math.min(1, s / denom);
    if (sim < min) continue;
    hits.sort((a, b) => b.weight - a.weight);
    out.push({
      id: d.id,
      name: d.name,
      blurb: d.blurb,
      tracks: d.tracks,
      sim: Math.round(sim * 1000) / 1000,
      why: {
        terms: hits.filter((h) => !h.term.includes(' ')).slice(0, 6).map((h) => h.term),
        phrases: hits.filter((h) => h.term.includes(' ')).slice(0, 4).map((h) => h.term),
        generic: hits.filter((h) => h.term.split(' ').every((p) => DOMAIN_GENERIC.has(p))).map((h) => h.term),
      },
    });
  }
  out.sort((a, b) => b.sim - a.sim || String(a.name).localeCompare(String(b.name)));
  return { info: Math.round(info * 100) / 100, specific: specificInfo >= MIN_INFO * 0.4, results: out.slice(0, limit) };
}

export function strength(sim) {
  return sim >= 0.55 ? 'strong' : sim >= 0.3 ? 'partial' : 'weak';
}

// Track crowding from similar entries, not from keyword hits.
// matches: [{ tracks, sim or overlap }]. threshold applies to the 0..1 similarity.
export function similarByTrack(matches, trackRows, { threshold = 0.3 } = {}) {
  const rows = (trackRows || []).map((t) => ({ id: t.id, label: t.label, entries: t.count ?? null, similar: 0, names: [] }));
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const m of matches || []) {
    const s = typeof m.score === 'number' ? m.score : m.sim;
    if (!(s >= threshold)) continue;
    for (const t of m.tracks || []) {
      const row = byId.get(t);
      if (!row) continue;
      row.similar += 1;
      if (row.names.length < 4) row.names.push(m.name);
    }
  }
  return rows.filter((r) => r.similar > 0).sort((a, b) => b.similar - a.similar || a.label.localeCompare(b.label));
}
