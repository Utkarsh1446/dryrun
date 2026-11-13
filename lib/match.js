import { normName, tokens } from './text.js';
import { validRepo } from './repo.js';

const SKIP_OWNERS = new Set('orgs topics features settings marketplace apps about site pricing login signup explore notifications new sponsors customer-stories readme blog enterprise security resources solutions team git pages education open-source collections events account codespaces copilot organizations users pulls issues search trending org settings'.split(' '));
const SKIP_REPOS = new Set('issues pulls actions blob tree releases wiki security pulse community graphs projects network settings commits branches tags labels milestones discussions sponsors packages deployments activity compare commit stargazers watchers forks followers following repositories stars gists'.split(' '));

// Single tokens that show up in too many hackathon names to identify a repository.
const GENERIC = new Set('agent agents guard wallet wallets chain token tokens payment payments contract protocol hackathon security private privacy money defi swap swaps intent intents cloud model models spend spending limit limits policy invoice payroll checkout link app tool tools open beta test demo code build near crypto blockchain smart account accounts api bot bots network data system service platform studio labs lab hub base core pro plus mini'.split(' '));

export function sameRepo(a, b) {
  const left = canonRepo(a);
  const right = canonRepo(b);
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase());
}

export function canonRepo(url) {
  const m = String(url || '').match(/github\.com\/([\w.-]+)\/([\w.-]+)/i);
  if (!m) return null;
  const owner = m[1];
  const repo = m[2].replace(/\.git$/i, '');
  if (SKIP_OWNERS.has(owner.toLowerCase()) || SKIP_REPOS.has(repo.toLowerCase())) return null;
  const clean = `https://github.com/${owner}/${repo}`;
  return validRepo(clean) ? clean : null;
}

export function extractGithubRepos(text) {
  const out = [];
  const seen = new Set();
  for (const m of String(text || '').matchAll(/github\.com\/([\w.-]+)\/([\w.-]+)/gi)) {
    const url = canonRepo(`https://github.com/${m[1]}/${m[2]}`);
    if (!url) continue;
    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(url);
  }
  return out;
}

export function demoPostApiUrl(demoUrl) {
  const m = String(demoUrl || '').match(/^https:\/\/(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/status\/(\d+)\/?(?:\?.*)?$/i);
  if (!m) return null;
  return { syndication: `https://cdn.syndication.twimg.com/tweet-result?id=${m[2]}&token=0`, fallback: `https://api.fxtwitter.com/${m[1]}/status/${m[2]}` };
}

export function reposFromTweet(json) {
  if (!json || typeof json !== 'object') return [];
  const tweet = json.tweet || json;
  const chunks = [];
  if (typeof tweet.text === 'string') chunks.push(tweet.text);
  for (const u of tweet.entities?.urls || []) if (u?.expanded_url) chunks.push(u.expanded_url);
  if (tweet.card?.url) chunks.push(tweet.card.url);
  if (typeof tweet.card?.description === 'string') chunks.push(tweet.card.description);
  return extractGithubRepos(chunks.join('\n'));
}

export function tweetHasBody(json) {
  const tweet = json?.tweet || json;
  return Boolean(tweet && (tweet.text || tweet.__typename === 'Tweet' || tweet.card));
}

// 1 exact name, 0.96 repo name is a leading phrase, 0.9 full project name is in the description,
// ~0.84 every repo-name token is in the project and at least one is distinctive. Else 0.
export function nameScore(projectName, repoName, description = '') {
  const pn = normName(projectName);
  const rn = normName(repoName);
  if (!pn || !rn) return 0;
  if (pn === rn) return 1;
  const desc = normName(description);
  if (pn.length >= 8 && ` ${desc} `.includes(` ${pn} `)) return 0.9;
  const first = rn.split(' ')[0];
  if (rn.length >= 4 && first && !GENERIC.has(first) && pn.startsWith(rn + ' ')) return 0.96;
  const pTokens = tokens(projectName);
  const rTokens = tokens(repoName);
  if (rTokens.length && rTokens.every((t) => pTokens.includes(t)) && rTokens.some((t) => t.length >= 4 && !GENERIC.has(t))) {
    return Math.min(0.9, 0.82 + rTokens.length * 0.02);
  }
  return 0;
}

// Greedy one-to-one assignment. A close second place is left unmatched rather than guessed.
export function assignSearchHits(projects, repos, { threshold = 0.8, margin = 0.08 } = {}) {
  const pairs = [];
  for (const p of projects || []) {
    for (const r of repos || []) {
      const url = canonRepo(r.url || r.html_url || '');
      if (!url) continue;
      const score = nameScore(p.name, r.name, r.description || '');
      if (score < threshold) continue;
      pairs.push({ id: p.id, url, score, confidence: score >= 0.99 ? 'high' : 'medium' });
    }
  }
  pairs.sort((a, b) => b.score - a.score || String(a.id).localeCompare(String(b.id)));
  const usedP = new Set();
  const usedR = new Set();
  const out = [];
  for (const pair of pairs) {
    if (usedP.has(pair.id) || usedR.has(pair.url)) continue;
    const closeProject = pairs.some((x) => x.id === pair.id && x.url !== pair.url && pair.score - x.score < margin);
    const closeRepo = pairs.some((x) => x.url === pair.url && x.id !== pair.id && pair.score - x.score < margin);
    if (closeProject || closeRepo) continue;
    usedP.add(pair.id);
    usedR.add(pair.url);
    out.push(pair);
  }
  return out;
}

export async function searchGithub(query, { fetchImpl = fetch, token = process.env.GITHUB_TOKEN || '' } = {}) {
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&per_page=100&sort=updated`;
  const headers = { accept: 'application/vnd.github+json', 'user-agent': 'DryRun/0.2 (hackathon directory monitor)' };
  if (token) headers.authorization = `Bearer ${token}`;
  const r = await fetchImpl(url, { redirect: 'manual', headers, signal: AbortSignal.timeout(20_000) });
  if (r.status === 403 || r.status === 429) return { rateLimited: true, items: [] };
  if (r.status >= 300 && r.status < 400) return { rateLimited: false, items: [], error: 'redirect refused' };
  if (!r.ok) return { rateLimited: false, items: [], error: `HTTP ${r.status}` };
  const body = await r.json().catch(() => ({}));
  const items = (body.items || []).map((it) => ({
    url: canonRepo(it.html_url),
    name: it.name || '',
    description: it.description || '',
  })).filter((it) => it.url);
  return { rateLimited: false, items };
}

export function needsDemoFetch(record, nowMs, retryMs = 30 * 60 * 1000) {
  if (!record) return true;
  // Read before descriptions were kept: read once more for the text.
  if (!record.error && record.text === undefined) return true;
  if (record.error && nowMs - Date.parse(record.at) > retryMs) return true;
  return false;
}
