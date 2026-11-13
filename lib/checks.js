// Deterministic checks of a repo snapshot + draft submission against nearhackathon.com/HACKATHON.md.
// Pure: no I/O, so the whole rulebook is unit-testable.

export const TRACKS = ['defi', 'thesis', 'privacy', 'business', 'swarms', 'security', 'agents', 'realworld', 'games', 'nfts', 'memecoins', 'social', 'open'];
const ANNOUNCED = '2026-10-19'; // Q-001: work from the announcement onward counts
const NEAR_ACCOUNT = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;
const HYPE = /\b(revolutionary|game[- ]chang\w+|seamless\w*|cutting[- ]edge|next[- ]gen\w*|unleash\w*|world[- ]class|supercharge\w*|disrupt\w*)\b/gi;
const SECRETS = [
  // tx signatures are also ed25519:<88 chars>, so only flag ones stored under a secret/private key name
  [/(?:secret|private)[_-]?key["'\s:=]+ed25519:[1-9A-HJ-NP-Za-km-z]{80,}/i, 'NEAR secret key'],
  [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, 'private key'],
  [/\bsk-[A-Za-z0-9_-]{24,}/, 'API key'],
  [/\bgh[pousr]_[A-Za-z0-9]{36}\b/, 'GitHub token'],
];
const PM_BUILTINS = new Set(['install', 'i', 'ci', 'add', 'dlx', 'exec', 'create', 'init', 'link', 'remove', 'up', 'upgrade', 'why', 'run', 'global']);

const res = (id, level, title, detail, fix) => ({ id, level, title, detail, ...(fix && level !== 'pass' ? { fix } : {}) });
const base = (p) => p.split('/').pop();

export function readmeCommands(readme) {
  const out = [];
  for (const block of readme.matchAll(/```[^\n]*\n([\s\S]*?)```/g))
    for (let line of block[1].split('\n')) {
      line = line.trim().replace(/^\$\s+/, '');
      if (line && !line.startsWith('#')) out.push(line);
    }
  return out;
}

// Commands in the README that point at a script or file the repo does not contain.
export function unresolvedCommands(commands, files) {
  const paths = [...files.keys()];
  const has = (p) => { p = p.replace(/^\.\//, ''); return paths.some((f) => f === p || f.endsWith('/' + p)); };
  const scripts = new Set();
  for (const p of paths) if (base(p) === 'package.json')
    try { Object.keys(JSON.parse(files.get(p)).scripts || {}).forEach((s) => scripts.add(s)); } catch { /* malformed package.json: no scripts */ }
  const bad = [];
  for (const line of commands) for (const cmd of line.split(/&&|;|\|\|/).map((s) => s.trim())) {
    let m;
    if ((m = cmd.match(/^(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?([\w:.-]+)/))) {
      const s = m[1];
      if (s.startsWith('-') || (PM_BUILTINS.has(s) && !/\srun\s/.test(cmd))) continue;
      if (/\.\w+$/.test(s)) { if (!has(s)) bad.push(`${cmd} (${s} not in repo)`); continue; } // "bun server.js"
      if (scripts.has(s) || (s === 'start' && has('server.js'))) continue;
      bad.push(`${cmd} (no "${s}" script in any package.json)`);
    } else if ((m = cmd.match(/^(?:node|python3?|bash|sh|tsx|ts-node|deno run|bun)\s+(?:-\S+\s+)*([\w./-]+\.(?:m?js|cjs|ts|py|sh))\b/)) || (m = cmd.match(/^(\.\/[\w./-]+)/))) {
      if (!has(m[1])) bad.push(`${cmd} (${m[1]} not in repo)`);
    } else if (/^make\b/.test(cmd) && !has('Makefile')) bad.push(`${cmd} (no Makefile)`);
    else if (/^cargo\b/.test(cmd) && !has('Cargo.toml')) bad.push(`${cmd} (no Cargo.toml)`);
    else if (/^docker[- ]compose\b/.test(cmd) && !paths.some((f) => /(^|\/)(docker-)?compose\.ya?ml$/.test(f))) bad.push(`${cmd} (no compose file)`);
  }
  return bad;
}

// snapshot: { files: Map<path, string|null>, commits: ISO date strings (newest first), tags: string[] }
export function checkRepo({ files, commits = [], tags = [] }) {
  const out = [];
  const paths = [...files.keys()];
  const root = paths.filter((p) => !p.includes('/'));

  out.push(root.some((p) => /^(LICEN[SC]E|COPYING)(\..+)?$/i.test(p))
    ? res('license', 'pass', 'LICENSE file present', 'Q-014 satisfied.')
    : res('license', 'fail', 'No LICENSE file', 'Q-014: "Add a LICENSE file" — any license is fine, MIT suggested.', 'Add a LICENSE file at the repo root.'));

  const readmePath = root.find((p) => /^readme(\.md|\.mdx|\.txt)?$/i.test(p));
  const readme = (readmePath && files.get(readmePath)) || '';
  if (readme.length < 200) {
    out.push(res('readme', 'fail', 'README missing or too thin', 'The AI screeners verify the project "does what its README says" — there is nothing for them to verify.', 'Write a README: what it is, the problem, and "do X – see Y" steps.'));
  } else {
    out.push(res('readme', 'pass', 'README present', `${readmePath}, ${readme.length} chars.`));
    const cmds = readmeCommands(readme);
    const runnable = cmds.filter((c) => /^(npm|pnpm|yarn|bun|node|cargo|python3?|pip3?|docker|make|near|git clone|\.\/|bash|sh|deno|go|uv|poetry)\b/.test(c));
    out.push(runnable.length
      ? res('run-steps', 'pass', 'README has runnable steps', `${runnable.length} command(s) in code blocks.`)
      : res('run-steps', 'fail', 'README has no runnable steps', 'Screening is reproducibility-first (Q-017). No shell commands were found in fenced code blocks.', 'Add a fenced block with the exact install + run commands, then one "do X – see Y" check.'));
    const bad = unresolvedCommands(cmds, files);
    if (runnable.length) out.push(bad.length
      ? res('commands-resolve', 'fail', 'README commands point at things that do not exist', bad.join(' · '), 'Fix the command or add the missing script/file. A screener that copy-pastes this will fail.')
      : res('commands-resolve', 'pass', 'README commands resolve', 'Every script and file the README runs exists in the repo.'));
    out.push(/\b(dependenc|librar|built with|stack|boilerplate|ai[- ]generated|generated with|claude|codex|copilot)/i.test(readme)
      ? res('disclosure', 'pass', 'Libraries / AI use disclosed', 'Q-005 satisfied.')
      : res('disclosure', 'warn', 'Libraries and AI-generated code not listed', 'Q-005: libraries, boilerplate and AI-generated code are allowed — "List them in the README".', 'Add a short "Built with" section naming libraries and any AI coding tools used.'));
    const near = (readme.match(/\bNEAR\b|near intents|chain signatures|near ai|\.near\b|testnet/gi) || []).length;
    out.push(near >= 3
      ? res('near-role', 'pass', 'NEAR role is described', `${near} NEAR references in the README.`)
      : res('near-role', 'warn', 'NEAR\'s concrete role is unclear', 'Only the NEAR integration built in the window is judged (Q-002). The README barely mentions it.', 'Add a section: which NEAR tech is used, where in the code, and why it is needed.'));
    const hype = [...new Set((readme.match(HYPE) || []).map((w) => w.toLowerCase()))];
    if (hype.length >= 3) out.push(res('marketing', 'warn', 'README reads like marketing', `The rules ask for steps "with no marketing". Found: ${hype.join(', ')}.`, 'Replace adjectives with what the product does and how to verify it.'));
  }

  const tracked = paths.filter((p) => /(^|\/)\.env(\.(local|production|development))?$/.test(p));
  const leaks = tracked.map((p) => `${p} (tracked env file)`);
  for (const [p, text] of files) if (text) for (const [re, label] of SECRETS) if (re.test(text)) { leaks.push(`${p} (${label})`); break; }
  out.push(leaks.length
    ? res('secrets', 'fail', 'Possible secrets committed', leaks.slice(0, 8).join(' · '), 'Rotate the key, remove the file from history, and commit an .env.example instead. The repo goes public at submission.')
    : res('secrets', 'pass', 'No secrets found', 'No tracked .env files or key-shaped strings.'));

  const usesEnv = paths.some((p) => /\.(m?js|ts|tsx|py|rs)$/.test(p) && /process\.env\.|os\.environ|env::var/.test(files.get(p) || ''));
  if (usesEnv && !paths.some((p) => /\.env\.(example|sample|template)$/.test(p)) && !/\benv(ironment)? var|export [A-Z_]+=|\.env\b/i.test(readme))
    out.push(res('env-example', 'warn', 'Code reads env vars the README never mentions', 'A screener cannot guess your configuration.', 'Add an .env.example and say in the README which variables are required.'));

  if (commits.length) {
    const inWindow = commits.filter((d) => d >= ANNOUNCED).length;
    const before = commits.length - inWindow;
    if (!inWindow) out.push(res('window', 'fail', 'No commits since the announcement', `Q-001/Q-004: an old project as-is does not qualify. Newest commit: ${commits[0].slice(0, 10)}.`, 'Only work from 2026-10-19 onward counts.'));
    else if (before && !tags.some((t) => /pre-hackathon|hackathon-submission/.test(t)) && !/pre-hackathon|baseline/i.test(readme))
      out.push(res('window', 'warn', 'Pre-hackathon code is not separated', `${before} commit(s) predate 2026-10-19. Q-003 asks for a dedicated branch or pre-hackathon / hackathon-submission tags plus a README section linking the diff.`, 'git tag pre-hackathon <last-old-commit>; git tag hackathon-submission; link the compare URL in the README.'));
    else out.push(res('window', 'pass', 'Work falls inside the hackathon window', `${inWindow} commit(s) since 2026-10-19.`));
  }

  if (paths.some((p) => base(p) === 'package.json' && /"dependencies"\s*:\s*\{\s*"/.test(files.get(p) || '')) && !paths.some((p) => /(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?)$/.test(p)))
    out.push(res('lockfile', 'warn', 'No lockfile', 'Installs are not reproducible; a dependency release between now and judging can break the run.', 'Commit your lockfile.'));

  if (!paths.some((p) => /(^|\/)(tests?|__tests__|spec)\/|\.(test|spec)\.\w+$|_test\.(py|go|rs)$/.test(p)))
    out.push(res('tests', 'warn', 'No tests found', 'The AI screeners do "feature verification". Without tests they can only trust the README.', 'Add one test that exercises the core claim.'));

  return out;
}

// Mirrors the field table of POST /api/applications. Only fields the user filled in are checked.
export function checkSubmission(s = {}) {
  const out = [];
  const len = (v, min, max) => typeof v === 'string' && v.trim().length >= min && v.trim().length <= max;
  if (s.projectName !== undefined && s.projectName !== '') out.push(len(s.projectName, 2, 80)
    ? res('f-name', 'pass', 'Project name length OK', `${s.projectName.trim().length}/80 chars.`)
    : res('f-name', 'fail', 'Project name must be 2–80 characters', `Currently ${String(s.projectName).trim().length}.`, 'Shorten it — the API returns 400.'));
  if (s.idea) out.push(len(s.idea, 20, 2000)
    ? res('f-idea', 'pass', 'Description length OK', `${s.idea.trim().length}/2000 chars.`)
    : res('f-idea', 'fail', 'Description must be 20–2000 characters', `Currently ${s.idea.trim().length}.`, 'Trim it — the API returns 400.'));
  if (s.nearAddress) out.push(len(s.nearAddress, 2, 64) && NEAR_ACCOUNT.test(s.nearAddress)
    ? res('f-near', 'pass', 'NEAR account format OK', s.nearAddress)
    : res('f-near', 'fail', 'NEAR account is not valid', 'Must be 2–64 chars, lowercase, NEAR account format. Prizes are paid to this address.', 'Use e.g. yourname.near or a 64-char implicit account, all lowercase.'));
  if (s.tracks?.length) {
    const bad = s.tracks.filter((t) => !TRACKS.includes(t));
    out.push(bad.length || new Set(s.tracks).size !== s.tracks.length
      ? res('f-tracks', 'fail', 'Invalid or duplicate track ids', bad.join(', ') || 'duplicates', `Valid ids: ${TRACKS.join(', ')}.`)
      : res('f-tracks', 'pass', 'Track ids valid', s.tracks.join(', ')));
  }
  if (s.demoUrl) out.push(/^https:\/\/(x|twitter)\.com\/\w+\/status\/\d+/.test(s.demoUrl) && s.demoUrl.length <= 300
    ? res('f-demo', 'pass', 'Demo post URL OK', s.demoUrl)
    : res('f-demo', 'fail', 'Demo URL is not a public X post', 'The demo must be an X post (x.com/<user>/status/<id>), max 300 chars.', 'Publish the post first, then paste its URL.'));
  if (s.demoText) {
    const miss = [];
    if (!/@NEARProtocol\b/i.test(s.demoText)) miss.push('@NEARProtocol');
    if (!/#NEARHackathon\b/i.test(s.demoText)) miss.push('#NEARHackathon');
    if (!/near\s*hackathon/i.test(s.demoText.replace(/#NEARHackathon/gi, ''))) miss.push('a statement that it was built at NEAR HACKATHON');
    if (!/https?:\/\//.test(s.demoText)) miss.push('a link to the repo or demo');
    out.push(miss.length
      ? res('f-post', 'fail', 'Demo post draft is missing required elements', `Missing: ${miss.join(', ')}.`, 'Add them before posting — the post cannot be swapped after you submit.')
      : res('f-post', 'pass', 'Demo post draft has the required tags', 'Remember: attach a video (Q-012 — screenshots alone are not enough if judges cannot open the demo).'));
  }
  const bytes = Buffer.byteLength(JSON.stringify(s));
  if (bytes > 12000) out.push(res('f-size', 'fail', 'Submission body too large', `${bytes} bytes; limit is 12,000 (HTTP 413).`, 'Shorten the description.'));
  return out;
}

// directory: [{project_name, tracks}] from nearhackathon.com/api/projects
export function checkDirectory(directory, { projectName, tracks = [] } = {}) {
  const out = [];
  if (!directory?.length) return out;
  const norm = (n) => n.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (projectName) {
    const mine = norm(projectName).split(' ')[0];
    const clash = directory.filter((p) => norm(p.project_name).split(' ').includes(mine)).map((p) => p.project_name);
    out.push(clash.length
      ? res('d-name', 'warn', `${clash.length} submitted project(s) share your name`, clash.slice(0, 6).join(' · '), 'Judges skim 800+ names. Pick one they cannot confuse with another entry.')
      : res('d-name', 'pass', 'Name is unique in the directory', `No clash among ${directory.length} submissions.`));
  }
  const count = Object.fromEntries(TRACKS.map((t) => [t, directory.filter((p) => p.tracks.includes(t)).length]));
  for (const t of tracks.filter((t) => TRACKS.includes(t))) {
    const share = Math.round((100 * count[t]) / directory.length);
    out.push(res('d-' + t, share >= 25 ? 'warn' : 'pass', `Track "${t}": ${count[t]} entries (${share}% of all)`, `Three prizes per track. Least crowded right now: ${Object.entries(count).sort((a, b) => a[1] - b[1]).slice(0, 3).map(([k, v]) => `${k} (${v})`).join(', ')}.`, 'If your project honestly fits a quieter track, add it.'));
  }
  return out;
}

export function score(results) {
  const fails = results.filter((r) => r.level === 'fail').length;
  const warns = results.filter((r) => r.level === 'warn').length;
  return { score: Math.max(0, 100 - 15 * fails - 4 * warns), fails, warns, verdict: fails ? 'Not ready — fix the failures before you submit' : warns ? 'Submittable, with risks' : 'Ready to submit' };
}
