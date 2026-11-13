const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const show = (node, msg) => { if (!node) return; node.textContent = msg || ''; node.hidden = !msg; };
const num = (v) => v == null || Number.isNaN(v) ? '…' : Number(v).toLocaleString();
const when = (iso) => { if (!iso) return ''; const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(); };
const pct = (share) => `${Math.round((share || 0) * 100)}%`;

const state = { overview: null, field: null, track: '', q: '', show: 40, poll: null, triage: null };

async function api(path, body) {
  const r = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

function trackName(id, tracks) {
  return (tracks || []).find((t) => t.id === id)?.label || id;
}

function scanLine(scan) {
  if (!scan) return 'Starting.';
  if (scan.phase === 'directory' && scan.directory) return `Reading directory page ${scan.directory.page} of ${scan.directory.pages}.`;
  if (scan.phase === 'matching' && scan.matching) return `Reading demo posts ${num(scan.matching.done)} of ${num(scan.matching.total)}. Scoring ${num(scan.scoring?.done)} of ${num(scan.scoring?.total)} matched repositories.`;
  if (scan.phase === 'scoring' && scan.scoring) return `Scoring repositories ${num(scan.scoring.done)} of ${num(scan.scoring.total)}.`;
  if (scan.phase === 'idle') return 'Caught up. The directory is read again about every 10 minutes.';
  if (scan.phase === 'error') return scan.error || 'The last read failed. The saved copy is still shown.';
  return 'Starting the directory scan.';
}

function paintHome(o) {
  state.overview = o;
  if (o?.hackathon?.name) $('home-kicker').textContent = o.hackathon.name;
  const room = (o?.tracks || []).filter((t) => t.room === 'open').length;
  $('stat-entries').textContent = o?.ready ? num(o.total) : '…';
  $('stat-room').textContent = o?.ready ? num(room) : '…';
  $('stat-matched').textContent = o?.ready ? num(o.coverage?.matched) : '…';
  $('stat-scored').textContent = o?.ready ? num(o.coverage?.scored) : '…';
  const bits = [scanLine(o?.scan)];
  if (o?.fetchedAt) bits.push(`Directory read ${when(o.fetchedAt)}.`);
  if (o?.scan?.error) bits.push(o.scan.error);
  $('home-scan').textContent = bits.join(' ');
  const quiet = (o?.tracks || []).slice().sort((a, b) => a.count - b.count).slice(0, 3);
  $('home-quiet').textContent = o?.ready && quiet.length
    ? `Quietest tracks in this reading: ${quiet.map((t) => `${t.label} (${num(t.count)})`).join(', ')}.`
    : '';
  if (o?.priceUsd != null) $('price-deep').textContent = `$${Number(o.priceUsd) % 1 ? o.priceUsd : Number(o.priceUsd)}`;
  $('pay-note').textContent = o ? (o.paymentsLive
    ? 'Deep-review payments are live in this process.'
    : 'Deep-review quotes are dry in this process until DRYRUN_RECIPIENT is set. The price above is still the configured price.') : '';
}

function coverageLine(f) {
  if (!f?.ready || !f.coverage) return 'The directory has not been read yet.';
  const c = f.coverage;
  return `${num(f.total)} entries reported, ${num(f.collected)} collected. Demo posts read ${num(c.demoChecked)} of ${num(c.withDemo)}. Matched ${num(c.matched)} (${num(c.high)} high, ${num(c.medium)} medium, ${num(c.low)} low). Scored ${num(c.scored)}. Unmatched ${num(c.unmatched)}. Clone failures ${num(c.cloneFailed)}. Repositories shared by more than one entry: ${num(c.sharedRepos)}.`;
}

function paintGrowth(f) {
  const box = $('field-growth');
  box.replaceChildren();
  const g = f?.growth || [];
  const h = el('h2', '', 'Growth');
  box.append(h);
  if (!f?.ready || g.length < 2) {
    const total = f?.ready ? `${num(f.total)} entries` : 'no count yet';
    const at = f?.fetchedAt ? ` at ${when(f.fetchedAt)}` : '';
    box.append(el('p', 'small', `One snapshot so far: ${total}${at}. Another snapshot is stored only when a later reading differs. Earlier history is not invented.`));
    return;
  }
  const max = Math.max(...g.map((p) => p.total));
  const row = el('div', 'stats');
  for (const p of g.slice(-8)) {
    const card = el('div', 'stat');
    card.append(el('b', '', num(p.total)));
    card.append(el('span', '', when(p.at)));
    const bar = el('div', 'bar');
    const span = el('span');
    span.style.width = `${Math.max(4, Math.round((p.total / max) * 100))}%`;
    bar.append(span);
    card.append(bar);
    row.append(card);
  }
  const first = g[0];
  const last = g[g.length - 1];
  const delta = last.total - first.total;
  box.append(el('p', 'small', `${delta >= 0 ? '+' : ''}${num(delta)} entries between ${when(first.at)} and ${when(last.at)}.`));
  box.append(row);
}

function paintTracks(f) {
  const tracks = f?.tracks || [];
  const max = Math.max(1, ...tracks.map((t) => t.count));
  const table = el('table');
  const thead = el('thead');
  const hr = el('tr');
  for (const h of ['Track', 'Entries', 'Share', 'Single-track', 'Room', '']) hr.append(el('th', '', h));
  thead.append(hr);
  const tb = el('tbody');
  for (const t of tracks) {
    const tr = el('tr');
    tr.append(el('td', '', t.label));
    tr.append(el('td', '', num(t.count)));
    tr.append(el('td', '', pct(t.share)));
    tr.append(el('td', '', num(t.single)));
    const room = t.room === 'crowded' ? 'Crowded' : t.room === 'busy' ? 'Busy' : 'Room';
    const roomTd = el('td');
    roomTd.append(el('span', `pill room-${t.room}`, room));
    tr.append(roomTd);
    const barTd = el('td');
    const bar = el('div', 'bar');
    const span = el('span');
    span.style.width = `${Math.round((t.count / max) * 100)}%`;
    bar.append(span);
    barTd.append(bar);
    tr.append(barTd);
    tb.append(tr);
  }
  table.append(thead, tb);
  $('field-tracks').replaceChildren(table);
  const sel = $('field-track');
  const current = state.track;
  const options = [el('option', '', 'All scored')];
  options[0].value = '';
  for (const t of [...tracks].sort((a, b) => a.label.localeCompare(b.label))) {
    const o = el('option', '', t.label);
    o.value = t.id;
    options.push(o);
  }
  sel.replaceChildren(...options);
  sel.value = current;
}

function paintClusters(f) {
  const box = $('field-clusters');
  box.replaceChildren();
  const c = f?.clusters || { tokens: [], names: [], near: [] };
  const block = (title, groups) => {
    const wrap = el('div');
    wrap.append(el('h3', '', title));
    if (!groups.length) { wrap.append(el('p', 'small', 'None in this reading.')); return wrap; }
    const chips = el('div', 'chips');
    for (const g of groups.slice(0, 12)) {
      const chip = el('span', 'chip', `${g.label} · ${g.count}`);
      chip.title = (g.names || []).join(', ');
      chips.append(chip);
    }
    wrap.append(chips);
    const sample = groups[0];
    if (sample?.names?.length) wrap.append(el('p', 'small cluster-name', `Largest: ${[...new Set(sample.names)].slice(0, 8).join(', ')}`));
    return wrap;
  };
  box.append(block('Shared words', c.tokens || []), block('Same name', c.names || []), block('Near-duplicate names', c.near || []));
}

function matchLabel(row) {
  const conf = row.confidence === 'high' ? 'High' : row.confidence === 'medium' ? 'Medium' : row.confidence === 'low' ? 'Low' : 'Unrated';
  const src = row.matchSource === 'demo-post' ? 'demo post' : row.matchSource === 'github-search' ? 'name search' : '';
  return src ? `${conf} · ${src}` : conf;
}

function boardRows(f) {
  let rows = [...(f?.board || [])];
  if (state.track) rows = rows.filter((r) => (r.tracks || []).includes(state.track));
  const q = state.q.trim().toLowerCase();
  if (q) rows = rows.filter((r) => `${r.name} ${r.repo || ''}`.toLowerCase().includes(q));
  if (state.track) rows.sort((a, b) => (a.trackRanks?.[state.track] || 9999) - (b.trackRanks?.[state.track] || 9999));
  else rows.sort((a, b) => a.rank - b.rank);
  return rows;
}

function paintBoard(f) {
  const rows = boardRows(f);
  const shown = rows.slice(0, state.show);
  const body = $('field-body');
  if (!shown.length) {
    const tr = el('tr');
    const td = el('td', '', f?.ready ? 'No scored repository matches this filter yet. Scores appear as public repos are read.' : 'Waiting for the directory.');
    td.colSpan = 7;
    tr.append(td);
    body.replaceChildren(tr);
  } else {
    body.replaceChildren(...shown.map((r) => {
      const tr = el('tr');
      const rank = state.track ? (r.trackRanks?.[state.track] || '—') : r.rank;
      tr.append(el('td', '', String(rank)));
      const name = el('td');
      name.append(el('div', '', r.name));
      const fail = (r.fixes || []).find((x) => x.level === 'fail');
      if (fail) name.append(el('div', 'small', fail.title));
      if (r.sharedRepo) name.append(el('div', 'small', 'Same repository as another entry'));
      tr.append(name);
      tr.append(el('td', '', (r.tracks || []).map((id) => trackName(id, f.tracks)).join(', ')));
      const score = el('td', r.fails ? 'bad' : r.warns ? 'warn' : 'good', String(r.score));
      score.title = r.verdict || '';
      tr.append(score);
      tr.append(el('td', '', `${r.fails ?? 0}`));
      const match = el('td', '', matchLabel(r));
      match.title = r.matchNote || '';
      tr.append(match);
      const repo = el('td');
      if (r.repo && /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(r.repo)) {
        const a = el('a', 'mono', r.repo.replace('https://github.com/', ''));
        a.href = r.repo;
        a.rel = 'noreferrer';
        a.target = '_blank';
        repo.append(a);
      } else repo.textContent = '—';
      tr.append(repo);
      return tr;
    }));
  }
  $('field-count').textContent = `${num(shown.length)} of ${num(rows.length)} shown${state.track ? ' in this track' : ''}. ${num(f?.board?.length || 0)} scored in total.`;
  $('field-more').hidden = shown.length >= rows.length;
}

function paintField(f) {
  state.field = f;
  $('field-scan').textContent = [scanLine(f?.scan), f?.scan?.error].filter(Boolean).join(' ');
  $('field-coverage').textContent = coverageLine(f);
  paintGrowth(f);
  paintTracks(f);
  paintClusters(f);
  paintBoard(f);
}

function fillTracks(container, tracks) {
  container.replaceChildren(...(tracks || []).map((t) => {
    const l = el('label');
    const c = el('input');
    c.type = 'checkbox';
    c.value = t.id;
    l.append(c, document.createTextNode(` ${t.label}`));
    return l;
  }));
}

function route() {
  const raw = (location.hash || '#home').replace('#', '') || 'home';
  const views = ['home', 'field', 'rank', 'idea', 'organizers', 'check'];
  const name = raw === 'pricing' || raw === 'contact' ? 'home' : (views.includes(raw) ? raw : 'home');
  for (const node of document.querySelectorAll('[data-view]')) node.hidden = node.dataset.view !== name;
  for (const a of document.querySelectorAll('[data-go]')) a.setAttribute('aria-current', a.dataset.go === raw || (a.dataset.go === name && raw !== 'pricing') ? 'page' : 'false');
  if (raw === 'pricing' || raw === 'contact') document.getElementById(raw)?.scrollIntoView();
  else window.scrollTo(0, 0);
  schedule();
  if (name === 'field') refreshField();
  if (name === 'home' || name === 'check' || name === 'rank') refreshOverview();
}

function schedule() {
  clearInterval(state.poll);
  const view = (document.querySelector('[data-view]:not([hidden])') || {}).dataset?.view;
  const ms = view === 'field' ? 8000 : 15000;
  state.poll = setInterval(() => {
    if (view === 'field') refreshField();
    else refreshOverview();
  }, ms);
}

async function refreshOverview() {
  try { paintHome(await api('/api/overview')); }
  catch (e) { $('home-scan').textContent = e.message; }
}

async function refreshField() {
  try { paintField(await api('/api/field')); }
  catch (e) { $('field-scan').textContent = e.message; }
}

function checked(id) {
  return [...document.querySelectorAll(`#${id} input:checked`)].map((c) => c.value);
}

function resultList(results) {
  const ul = el('ul', 'results');
  const order = { fail: 0, warn: 1, pass: 2 };
  for (const x of [...results].sort((a, b) => order[a.level] - order[b.level])) {
    const li = el('li');
    const head = el('div');
    head.append(el('span', `tag ${x.level === 'fail' ? 'bad' : x.level === 'warn' ? 'warn' : 'good'}`, x.level), el('span', '', ` ${x.title}`));
    li.append(head, el('p', 'small', x.detail || ''));
    if (x.fix) li.append(el('p', '', `Fix: ${x.fix}`));
    ul.append(li);
  }
  return ul;
}

function paintRank(r) {
  const box = $('rank-out');
  box.replaceChildren();
  const card = el('section', 'card');
  const line = el('div', 'scoreline');
  line.append(el('b', r.fails ? 'bad' : r.warns ? 'warn' : 'good', String(r.score)));
  const meta = el('div');
  meta.append(el('div', '', r.verdict || ''));
  const p = r.placement || {};
  meta.append(el('div', '', `Estimated rank ${p.rank} of ${p.of} scored repositories.`));
  meta.append(el('p', 'small', p.note || ''));
  if (r.directory) meta.append(el('p', 'small', `Directory: ${num(r.directory.total)} entries, ${num(r.directory.matched)} matched, ${num(r.directory.scored)} scored.`));
  line.append(meta);
  card.append(line);
  const tracks = Object.entries(p.tracks || {});
  if (tracks.length) {
    const chips = el('div', 'chips');
    for (const [id, t] of tracks) chips.append(el('span', 'chip', `${trackName(id, state.overview?.hackathon?.tracks)} : ${t.rank} of ${t.of}`));
    card.append(chips);
  }
  card.append(el('h2', '', 'Fix these first'), resultList(r.fixes || []));
  if (r.ai?.scores) {
    card.append(el('h2', '', 'Model reading'));
    card.append(el('p', 'small', 'This does not change the rank. It has no published weights behind it.'));
    const chips = el('div', 'chips');
    for (const [k, v] of Object.entries(r.ai.scores)) chips.append(el('span', 'chip', `${k} ${v}/5`));
    card.append(chips);
    if (r.ai.note) card.append(el('p', '', r.ai.note));
  } else {
    card.append(el('p', 'small', r.ai?.error ? `Model reading failed: ${r.ai.error}` : 'No model score in this process. Set NEAR_AI_API_KEY to add one. The rank stays the rule score either way.'));
  }
  box.append(card);
}

function paintIdea(r) {
  const box = $('idea-out');
  box.replaceChildren();
  const card = el('section', 'card');
  card.append(el('p', 'small', `${num(r.total)} entries in this reading. Overlap is shared words in the project name.`));
  if (r.clusters?.length) {
    card.append(el('h2', '', 'Clusters this sentence touches'));
    const chips = el('div', 'chips');
    for (const c of r.clusters) chips.append(el('span', 'chip', `${c.label} · ${c.count}`));
    card.append(chips);
  }
  card.append(el('h2', '', 'Similar names'));
  if (!r.similar?.length) card.append(el('p', '', 'No project name shares a word with this sentence.'));
  else {
    const ul = el('ul', 'results');
    for (const s of r.similar) {
      const li = el('li');
      li.append(el('div', '', s.name));
      li.append(el('p', 'small', `${(s.trackLabels || s.tracks || []).join(', ')} · shared: ${(s.shared || []).join(', ')}`));
      ul.append(li);
    }
    card.append(ul);
  }
  card.append(el('h2', '', 'Quietest tracks'));
  const chips = el('div', 'chips');
  for (const t of r.quiet || []) chips.append(el('span', 'chip', `${t.label} · ${num(t.count)}`));
  card.append(chips);
  if (r.ai?.note) {
    card.append(el('h2', '', 'Model note'));
    card.append(el('p', 'small', 'A model reading, not a count. The names above are the count.'));
    card.append(el('p', '', r.ai.note));
  } else card.append(el('p', 'small', 'Keyword overlap only. A model note is added when NEAR_AI_API_KEY is set.'));
  box.append(card);
}

function paintTriage(job) {
  const box = $('org-out');
  box.replaceChildren();
  const card = el('section', 'card');
  card.append(el('p', '', job.done ? `Done. ${job.total} repositories.` : `Reading ${job.completed || 0} of ${job.total}.`));
  if (job.overflow) card.append(el('p', 'small', `${job.overflow} more URLs were past the 20-repository cap and were not read.`));
  if (job.error) card.append(el('p', 'err', job.error));
  const table = el('table');
  const head = el('thead');
  const hrow = el('tr');
  for (const h of ['#', 'Repository', 'Why', 'Score', 'Flags']) hrow.append(el('th', '', h));
  head.append(hrow);
  const tb = el('tbody');
  (job.items || []).forEach((item, i) => {
    const tr = el('tr');
    tr.append(el('td', '', String(i + 1)));
    tr.append(el('td', 'mono', item.repo));
    const why = [item.reason];
    if (item.duplicate) why.push(`listed ${item.copies} times`);
    if (item.directoryNames?.length) why.push(`directory: ${item.directoryNames.slice(0, 3).join(', ')}`);
    tr.append(el('td', '', why.filter(Boolean).join(' · ')));
    tr.append(el('td', '', item.score == null ? '—' : String(item.score)));
    const flags = [];
    if (item.error) flags.push('will not clone');
    else for (const [k, v] of Object.entries(item.flags || {})) if (v === 'fail') flags.push(k);
    tr.append(el('td', '', flags.join(', ') || '—'));
    tb.append(tr);
  });
  table.append(head, tb);
  const wrap = el('div', 'table-wrap');
  wrap.append(table);
  card.append(wrap);
  box.append(card);
}

$('field-track').addEventListener('change', () => { state.track = $('field-track').value; state.show = 40; if (state.field) paintBoard(state.field); });
$('field-q').addEventListener('input', () => { state.q = $('field-q').value; state.show = 40; if (state.field) paintBoard(state.field); });
$('field-more').addEventListener('click', () => { state.show += 40; if (state.field) paintBoard(state.field); });

$('rank-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  show($('rank-err'));
  $('rank-go').disabled = true;
  $('rank-go').textContent = 'Cloning and reading…';
  $('rank-out').replaceChildren(el('p', 'small', 'Cloning and reading the repository. This can take a minute. Nothing in it is executed.'));
  try { paintRank(await api('/api/rank', { repo: $('rank-repo').value.trim(), tracks: checked('rank-tracks') })); }
  catch (err) { show($('rank-err'), err.message); $('rank-out').replaceChildren(); }
  $('rank-go').disabled = false;
  $('rank-go').textContent = 'Score and place me';
});

$('idea-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  show($('idea-err'));
  $('idea-go').disabled = true;
  try { paintIdea(await api('/api/idea', { text: $('idea-text').value.trim() })); }
  catch (err) { show($('idea-err'), err.message); }
  $('idea-go').disabled = false;
});

$('org-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  show($('org-err'));
  $('org-go').disabled = true;
  try {
    const started = await api('/api/triage', { text: $('org-text').value });
    const tick = async () => {
      const job = await api('/api/triage?id=' + encodeURIComponent(started.id));
      paintTriage(job);
      if (!job.done) setTimeout(tick, 2000);
      else $('org-go').disabled = false;
    };
    await tick();
  } catch (err) {
    show($('org-err'), err.message);
    $('org-go').disabled = false;
  }
});

$('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  show($('err'));
  $('go').disabled = true;
  $('go').textContent = 'Cloning and checking…';
  const repo = $('repo').value.trim();
  const submission = { tracks: checked('tracks') };
  for (const k of ['projectName', 'nearAddress', 'idea', 'demoText', 'demoUrl']) if ($(k).value.trim()) submission[k] = $(k).value.trim();
  try {
    const r = await api('/api/check', { repo, submission });
    $('score').textContent = r.score;
    $('score').className = r.fails ? 'bad' : r.warns ? 'warn' : 'good';
    $('verdict').textContent = r.verdict;
    $('counts').textContent = `${r.fails} failure(s), ${r.warns} warning(s), ${r.results.length - r.fails - r.warns} passed. Directory size in this reading: ${num(r.directorySize)}.`;
    $('results').replaceChildren(...resultList(r.results).childNodes);
    $('out').hidden = false;
    $('deep').hidden = false;
    $('review').replaceChildren();
    $('payinfo').hidden = true;
    window.__repo = r.repo || repo;
  } catch (err) { show($('err'), err.message); }
  $('go').disabled = false;
  $('go').textContent = 'Run free check';
});

let metaPay = {};
let pollTimer = null;
api('/api/tokens').then((t) => {
  metaPay = t;
  $('price').textContent = '$' + t.priceUsd;
  if ($('price-deep').textContent === '…') $('price-deep').textContent = '$' + t.priceUsd;
  $('asset').replaceChildren(...t.tokens.sort((a, b) => (a.symbol + a.blockchain).localeCompare(b.symbol + b.blockchain)).map((x) => {
    const o = el('option', '', `${x.symbol} on ${x.blockchain}`);
    o.value = x.assetId;
    return o;
  }));
  const usdc = t.tokens.find((x) => x.symbol === 'USDC' && x.blockchain === 'base');
  if (usdc) $('asset').value = usdc.assetId;
  if (t.freeDeep) { $('payform').querySelector('.split').hidden = true; $('quote').textContent = 'Run deep review (free in this build)'; }
}).catch(() => {});

async function runDeep(depositAddress) {
  $('review').replaceChildren(el('p', 'small', 'Reviewing on NEAR AI Cloud. This can take two minutes.'));
  const d = await api('/api/deep', { repo: window.__repo, depositAddress });
  const r = d.review || {};
  const box = el('div');
  box.append(el('p', '', r.summary || ''), el('p', 'small', 'Fresh-clone prediction: ' + (r.runPrediction || 'n/a')));
  const ul = el('ul', 'results');
  for (const c of r.claims || []) {
    const li = el('li');
    const head = el('div');
    const lvl = c.verdict === 'supported' ? 'good' : c.verdict === 'unsupported' ? 'bad' : 'warn';
    head.append(el('span', 'tag ' + lvl, c.verdict), el('span', '', ' ' + (c.claim || '')));
    li.append(head, el('p', 'small', c.evidence || ''));
    if (c.fix && lvl !== 'good') li.append(el('p', '', 'Fix: ' + c.fix));
    ul.append(li);
  }
  box.append(ul);
  if (r.topFixes?.length) {
    box.append(el('h3', '', 'Do these first'));
    const ol = el('ol');
    r.topFixes.forEach((f) => ol.append(el('li', '', f)));
    box.append(ol);
  }
  const sig = d.signature;
  const sigNote = sig
    ? ` · ${sig.kind || 'unspecified'} signature${sig.signingAddress ? ' by ' + sig.signingAddress : ''}`
    : ' · no gateway signature returned';
  box.append(el('p', 'small mono', `model ${d.model} · chat ${d.chatId}` + sigNote));
  $('review').replaceChildren(box);
}

$('quote').addEventListener('click', async () => {
  show($('perr'));
  $('quote').disabled = true;
  clearInterval(pollTimer);
  try {
    if (metaPay.freeDeep) { await runDeep(); return; }
    const q = await api('/api/quote', { originAsset: $('asset').value, refundTo: $('refund').value });
    const label = $('asset').selectedOptions[0]?.textContent || '';
    const info = $('payinfo');
    info.hidden = false;
    if (q.dry) {
      info.replaceChildren(el('p', '', `Quote: ${q.amountInFormatted} ${label} (about ${q.timeEstimate}s to settle).`), el('p', 'small', 'This process has no DRYRUN_RECIPIENT, so the quote is a dry run and no deposit address was issued.'));
      return;
    }
    const st = el('p', 'small', 'Waiting for the deposit…');
    info.replaceChildren(
      el('p', '', `Send exactly ${q.amountInFormatted} ${label} to:`),
      el('p', 'mono', q.depositAddress + (q.depositMemo ? `  memo: ${q.depositMemo}` : '')),
      el('p', 'small', `Valid until ${new Date(q.deadline).toLocaleTimeString()}. Anything that fails is refunded to your address.`),
      st,
    );
    pollTimer = setInterval(async () => {
      try {
        const s = await api('/api/status?depositAddress=' + encodeURIComponent(q.depositAddress));
        st.textContent = 'Status: ' + s.status;
        if (s.paid) { clearInterval(pollTimer); runDeep(q.depositAddress).catch((err) => show($('perr'), err.message)); }
        if (['REFUNDED', 'FAILED'].includes(s.status)) clearInterval(pollTimer);
      } catch { /* 404 until the deposit is seen */ }
    }, 5000);
  } catch (err) { show($('perr'), err.message); }
  finally { $('quote').disabled = false; }
});

window.addEventListener('hashchange', route);
refreshOverview().then(() => {
  const tracks = state.overview?.hackathon?.tracks || [];
  fillTracks($('tracks'), tracks);
  fillTracks($('rank-tracks'), tracks);
});
route();
