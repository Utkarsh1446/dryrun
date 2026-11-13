// Content signals for a repository snapshot. Pure except checkDemoLink.
// File presence is a small part of the score (the rules check, weight 10). The rest reads what is inside.
const base = (p) => p.split('/').pop();
const clamp = (v) => Math.max(0, Math.min(1, v));

export const WEIGHTS = { readme: 22, code: 25, near: 15, tests: 10, history: 10, demo: 8, rules: 10 };

const CODE_EXT = /\.(m?js|cjs|jsx|ts|tsx|rs|py|go|sol|move|cairo|vue|svelte|java|kt|swift|rb|c|cc|cpp|h)$/i;
const SKIP_PATH = /(^|\/)(node_modules|dist|build|out|\.next|vendor|target|coverage|public|static|assets|migrations|generated|__generated__|\.github)\//i;
const CONFIG_FILE = /(^|\/)([\w.-]*\.config\.[\w]+|\.eslintrc[\w.]*|\.prettierrc[\w.]*|babel\.config\.\w+|jest\.config\.\w+|setupTests\.\w+|reportWebVitals\.\w+|vite-env\.d\.ts|next-env\.d\.ts|[\w.-]+\.d\.ts|[\w.-]+\.min\.js)$/i;
const TEST_FILE = /(^|\/)(tests?|__tests__|spec|e2e)\/|\.(test|spec)\.\w+$|_test\.(py|go|rs)$|(^|\/)test_[\w]+\.py$/i;

// Text that template generators write. A README or source file made of it is scaffolding.
const TEMPLATE = [
  /bootstrapped with \[?create react app/i,
  /getting started with create react app/i,
  /this is a \[?next\.js\]? project bootstrapped/i,
  /this template (should help|provides a minimal setup)/i,
  /edit <code>src\/App/i,
  /get started by editing/i,
  /learn react<\/a>/i,
  /count is \{?count\}?/i,
  /vite \+ react/i,
  /welcome to your new/i,
  /^#\s*project title\s*$/im,
  /lorem ipsum/i,
  /a short description of (your|the) project/i,
  /this project was generated (with|using)/i,
  /todo:?\s*(write|add|fill|describe)/i,
  /hello,? world/i,
  /cargo near new|near-sdk.*greeting|get_greeting|set_greeting/i,
];
const PLACEHOLDER = /\b(TODO|FIXME|XXX)\b|not implemented|unimplemented!\(|todo!\(|NotImplementedError|throw new Error\(['"`](todo|not implemented)/gi;
const ASSERT = /\bassert(?:\.\w+)?\s*\(|\bexpect\s*\(|\.should\b|\bt\.(?:is|equal|deepEqual|ok|true|false|throws|same|match)\s*\(|assert_eq!|assert_ne!|assert!\(|self\.assert\w*\(|\brequire\.(?:Equal|NoError|True)\(|\bassert\s+\w/g;
const TRIVIAL_ASSERT = /expect\(\s*(true|1|['"]\w*['"])\s*\)\.(toBe|toEqual)\(\s*(true|1|['"]\w*['"])\s*\)|assert\s+True\b|assert\.ok\(\s*true\s*\)|assert_eq!\(\s*(\d+)\s*,\s*\5\s*\)|expect\(1 \+ 1\)/g;

// NEAR APIs a program actually calls or imports. README mentions do not count.
export const NEAR_CODE = [
  ['near-api-js', /from\s+['"]near-api-js|require\(['"]near-api-js/],
  ['@near-js', /from\s+['"]@near-js\/|require\(['"]@near-js\//],
  ['wallet selector', /@near-wallet-selector\//],
  ['near-sdk (Rust)', /use\s+near_sdk|near_sdk::|#\[near(_bindgen)?(\(|\])/],
  ['near-sdk-js', /from\s+['"]near-sdk-js/],
  ['near-workspaces', /near-workspaces|near_workspaces/],
  ['py-near', /from\s+py_near|import\s+py_near|from\s+near_api/],
  ['NEAR RPC', /rpc\.(mainnet|testnet)\.near\.org|rpc\.(mainnet|testnet)\.fastnear\.com|\bnearblocks\.io\/api|archival-rpc/],
  ['NEAR Intents', /1click\.chaindefuser\.com|intents\.near|solver-relay|defuse/i],
  ['NEAR AI Cloud', /cloud-api\.near\.ai|api\.near\.ai/],
  ['Chain Signatures', /\bv1\.signer(-prod)?\.(testnet|near)\b|\bsignatureRequest\b|\bderived_public_key\b/],
  ['contract calls', /\b(functionCall|viewFunction|callFunction|view_function|call_function|signAndSendTransaction)\b/],
];

const prose = (md) => md
  .replace(/```[\s\S]*?```/g, ' ')
  .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
  .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
  .replace(/<[^>]+>/g, ' ')
  .replace(/https?:\/\/\S+/g, ' ');

function codeStats(text) {
  let loc = 0;
  for (const line of String(text).split('\n')) {
    const t = line.trim();
    if (!t || /^(\/\/|#(?!\[)|\/\*|\*|--|""")/.test(t)) continue;
    loc += 1;
  }
  return loc;
}

export function readmeOf(files) {
  const p = [...files.keys()].filter((k) => /^readme(\.md|\.markdown|\.rst|\.txt)?$/i.test(base(k))).sort((a, b) => a.split('/').length - b.split('/').length)[0];
  return p ? { path: p, text: files.get(p) || '' } : null;
}

export function demoLinks(readme) {
  const urls = [...String(readme || '').matchAll(/https?:\/\/[^\s)<>"'\]]+/g)].map((m) => m[0].replace(/[.,;:]+$/, ''));
  const skip = /github\.com\/(?!.*\/releases)|shields\.io|badge|img\.|\.(png|jpe?g|gif|svg|webp)(\?|$)|npmjs\.com|docs\.|nodejs\.org|rust-lang|near\.org\/?$|nearhackathon\.com|opensource\.org|creativecommons|choosealicense|localhost|127\.0\.0\.1|example\.com/i;
  const good = /vercel\.app|netlify\.app|onrender\.com|pages\.dev|fly\.dev|railway\.app|herokuapp\.com|github\.io|youtube\.com|youtu\.be|loom\.com|x\.com\/\w+\/status|twitter\.com\/\w+\/status|\.app\b|\.xyz\b|\.io\b|\.ai\b/i;
  const list = [...new Set(urls)].filter((u) => !skip.test(u));
  return list.sort((a, b) => Number(good.test(b)) - Number(good.test(a))).slice(0, 3);
}

// One GET with a short timeout. Resolves to true, false, or null (not checked).
export async function checkDemoLink(url, { fetchImpl = fetch, timeoutMs = 8000 } = {}) {
  if (!url) return null;
  try {
    const r = await fetchImpl(url, { method: 'GET', redirect: 'follow', headers: { 'user-agent': 'DryRun/0.3 (demo link check)' }, signal: AbortSignal.timeout(timeoutMs) });
    try { await r.body?.cancel?.(); } catch { /* ignore */ }
    return r.status < 400 || r.status === 403 || r.status === 429;
  } catch {
    return false;
  }
}

function signal(id, label, value, detail, fix, evidence = []) {
  const weight = WEIGHTS[id];
  const v = clamp(value);
  return { id, label, weight, value: Math.round(v * 100) / 100, points: Math.round(v * weight * 10) / 10, detail, fix: v < 0.7 ? fix : '', evidence };
}

export function assessContent(snap, { rulesScore = null, demoOk = null } = {}) {
  const files = snap?.files instanceof Map ? snap.files : new Map();
  const paths = [...files.keys()];
  const out = [];

  // README substance.
  const rd = readmeOf(files);
  const readme = rd?.text || '';
  const words = prose(readme).split(/\s+/).filter((w) => /[a-z]{2,}/i.test(w)).length;
  const templateHits = TEMPLATE.filter((re) => re.test(readme)).length;
  const sec = {
    problem: /^#{1,4}.*\b(problem|why|motivation|overview|about|what it does|what is|the idea|use case)/im.test(readme) || /\b(problem|pain|today,? (teams|users|people)|users? (need|can't|cannot))\b/i.test(readme),
    setup: /^#{1,4}.*\b(install|setup|set up|getting started|quick ?start|run|usage|local|develop|try it|deploy|configuration)/im.test(readme) && /```/.test(readme),
    how: /^#{1,4}.*\b(architecture|how it works|design|under the hood|components|flow|layout|structure|what works|where near)/im.test(readme),
    demo: demoLinks(readme).length > 0 || /^#{1,4}.*\b(demo|video|screenshots?|live|try it)/im.test(readme),
  };
  let rv = 0.4 * Math.min(1, words / 800) + (sec.problem ? 0.2 : 0) + (sec.setup ? 0.2 : 0) + (sec.how ? 0.1 : 0) + (sec.demo ? 0.1 : 0);
  if (templateHits && words < 600) rv *= 0.25;
  out.push(signal('readme', 'README explains the problem, setup, and demo', rv,
    rd ? `${words} words of prose in ${rd.path}. Problem ${sec.problem ? 'yes' : 'no'}, setup ${sec.setup ? 'yes' : 'no'}, how it works ${sec.how ? 'yes' : 'no'}, demo ${sec.demo ? 'yes' : 'no'}.${templateHits ? ` ${templateHits} template phrase(s) found.` : ''}`
      : 'No README.',
    templateHits ? 'Replace the generator\'s README with your own: the problem, who it is for, exact setup commands, and a demo link.'
      : 'Add the missing sections: the problem, exact setup commands, how it works, and a demo link.',
    rd ? [rd.path] : []));

  // Real code vs scaffolding.
  const src = paths.filter((p) => CODE_EXT.test(p) && files.get(p) && !SKIP_PATH.test(p) && !CONFIG_FILE.test(p) && !TEST_FILE.test(p));
  let loc = 0, scaffoldLoc = 0, placeholders = 0;
  const bySize = [];
  for (const p of src) {
    const text = files.get(p);
    const n = codeStats(text);
    if (TEMPLATE.some((re) => re.test(text)) && n < 120) { scaffoldLoc += n; continue; }
    loc += n;
    placeholders += (text.match(PLACEHOLDER) || []).length;
    bySize.push([p, n]);
  }
  bySize.sort((a, b) => b[1] - a[1]);
  let cv = loc / (loc + 1500) / 0.8;
  if (bySize.length < 3) cv *= 0.6;
  if (loc && placeholders / Math.max(1, loc / 50) > 1) cv *= 0.7;
  out.push(signal('code', 'Real code, not scaffolding', cv,
    `${loc} lines of code in ${bySize.length} source file(s) after skipping config, tests, and generated files.${scaffoldLoc ? ` ${scaffoldLoc} line(s) of template code skipped.` : ''}${placeholders ? ` ${placeholders} TODO/not-implemented marker(s).` : ''}`,
    'The judged part is the code you wrote. Replace template files and placeholders with the working feature.',
    bySize.slice(0, 4).map(([p, n]) => `${p} (${n} lines)`)));

  // NEAR used in code, not only mentioned.
  const codeFiles = paths.filter((p) => (CODE_EXT.test(p) || /(^|\/)(Cargo\.toml|package\.json|pyproject\.toml|requirements\.txt)$/.test(p)) && files.get(p) && !SKIP_PATH.test(p));
  const found = new Map();
  for (const p of codeFiles) {
    if (/\.(json|toml|txt)$/.test(p)) continue;
    const text = files.get(p);
    for (const [name, re] of NEAR_CODE) if (!found.has(name) && re.test(text)) {
      const line = text.split('\n').findIndex((l) => re.test(l)) + 1;
      found.set(name, `${p}${line ? `:${line}` : ''}`);
    }
  }
  const declared = codeFiles.some((p) => /(package\.json|Cargo\.toml|pyproject\.toml|requirements\.txt)$/.test(p) && /near-api-js|@near-js|near-sdk|near_sdk|wallet-selector|py-near|near-workspaces/.test(files.get(p)));
  const nv = found.size >= 3 ? 1 : found.size === 2 ? 0.8 : found.size === 1 ? 0.55 : declared ? 0.2 : 0;
  out.push(signal('near', 'NEAR used in code', nv,
    found.size ? `Used in code: ${[...found.keys()].join(', ')}.` : declared ? 'A NEAR package is declared but never imported or called.' : 'No NEAR API is imported or called in code.',
    'Judges read the NEAR integration built in the window. Call it from code (SDK, RPC, Intents, AI Cloud, a contract) and say where in the README.',
    [...found.values()].slice(0, 5)));

  // Tests that test something.
  const tests = paths.filter((p) => TEST_FILE.test(p) && CODE_EXT.test(p) && files.get(p) && !/(^|\/)node_modules\//.test(p));
  let asserts = 0, trivial = 0;
  for (const p of tests) {
    const t = files.get(p);
    asserts += (t.match(ASSERT) || []).length;
    trivial += (t.match(TRIVIAL_ASSERT) || []).length;
  }
  const real = Math.max(0, asserts - trivial);
  out.push(signal('tests', 'Tests that check behaviour', Math.min(1, real / 40),
    tests.length ? `${tests.length} test file(s), ${real} real assertion(s)${trivial ? `, ${trivial} trivial (e.g. expect(true))` : ''}.` : 'No test files.',
    'Add tests that call your core functions and assert on their output.',
    tests.slice(0, 4)));

  // Commit history spread.
  const commits = (snap?.commits || []).filter(Boolean);
  const days = new Set(commits.map((d) => String(d).slice(0, 10)));
  const span = commits.length ? (Date.parse(commits[0]) - Date.parse(commits[commits.length - 1])) / 86400000 : 0;
  let hv = days.size >= 8 ? 1 : days.size >= 5 ? 0.85 : days.size >= 3 ? 0.6 : days.size === 2 ? 0.35 : days.size === 1 ? 0.15 : 0;
  if (commits.length < 4) hv = Math.min(hv, 0.2);
  out.push(signal('history', 'Work spread over time', hv,
    `${commits.length} commit(s) on ${days.size} day(s), spanning ${Math.max(0, Math.round(span))} day(s).`,
    'Commit as you build. A single dump of finished code is harder to trust.',
    []));

  // Demo link that resolves.
  const links = demoLinks(readme);
  const dv = !links.length ? 0 : demoOk === true ? 1 : demoOk === false ? 0.25 : 0.6;
  out.push(signal('demo', 'A demo link that opens', dv,
    !links.length ? 'No demo, video, or deployed link in the README.' : `${links[0]}: ${demoOk === true ? 'opens' : demoOk === false ? 'did not open' : 'not checked'}.`,
    'Put a working demo or video link near the top of the README.',
    links.slice(0, 1)));

  // File presence and rule hygiene: a minority of the score.
  const rv2 = typeof rulesScore === 'number' ? rulesScore / 100 : 0.5;
  out.push(signal('rules', 'Rule hygiene (files present, license, secrets)', rv2,
    typeof rulesScore === 'number' ? `Rules check ${rulesScore}/100.` : 'Rules check not run.',
    'Fix the rule failures listed above.',
    []));

  const total = Math.round(out.reduce((a, s) => a + s.points, 0));
  return { score: total, signals: out, readmeWords: words, loc, sourceFiles: bySize.length };
}

export function contentFixes(quality) {
  return (quality?.signals || [])
    .filter((s) => s.fix && s.id !== 'rules')
    .sort((a, b) => (b.weight * (1 - b.value)) - (a.weight * (1 - a.value)))
    .map((s) => ({ id: `content-${s.id}`, level: s.value < 0.35 ? 'fail' : 'warn', title: s.label, detail: s.detail, fix: s.fix }));
}
