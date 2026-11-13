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
  $('b-entries').textContent = $('stat-entries').textContent;
  $('b-scored').textContent = $('stat-scored').textContent;
  $('b-matched').textContent = $('stat-matched').textContent;
  if (o?.ready) paintHomeTracks(o);
  const view = (document.querySelector('[data-view]:not([hidden])') || {}).dataset?.view;
  if (view === 'home') { refreshHomeBoard(); paintRobotsTile(); }
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

const RING_COLORS = ['#605EA7', '#A5A0FF', '#11C8D5', '#FC79A4', '#FFCB3A'];
function paintHomeTracks(o) {
  const tracks = (o?.tracks || []).slice().sort((a, b) => b.count - a.count);
  const total = tracks.reduce((a, t) => a + t.count, 0) || 1;
  let at = 0;
  const stops = tracks.slice(0, 5).map((t, i) => { const from = at; at += (t.count / total) * 100; return `${RING_COLORS[i]} ${from.toFixed(1)}% ${at.toFixed(1)}%`; });
  if (stops.length) $('home-ring').style.background = `conic-gradient(${stops.join(', ')}, #E9EDEC ${at.toFixed(1)}% 100%)`;
  $('home-ring-key').replaceChildren(...tracks.slice(0, 3).map((t, i) => {
    const li = el('li');
    const dot = el('i'); dot.style.background = RING_COLORS[i];
    li.append(dot, document.createTextNode(`${t.label} ${num(t.count)}`));
    return li;
  }));
  $('tile-crowd').replaceChildren(...tracks.slice(0, 4).map((t) => el('span', '', `${t.label} ${num(t.count)}`)));
}

async function refreshHomeBoard() {
  if (state.homeBoardAt && Date.now() - state.homeBoardAt < 60000) return;
  state.homeBoardAt = Date.now();
  try {
    const f = await api('/api/field');
    const top = [...(f.board || [])].sort((a, b) => a.rank - b.rank).slice(0, 5);
    if (!top.length) return;
    $('home-board').replaceChildren(...top.map((r) => {
      const li = el('li');
      li.append(el('i', '', String(r.rank)), el('span', '', r.name), el('b', '', String(r.score)));
      return li;
    }));
    $('tile-top').textContent = String(top[0].score);
    $('tile-top-name').textContent = `${top[0].name} · #1 of ${num(f.board.length)} scored`;
  } catch { state.homeBoardAt = 0; }
}

async function paintRobotsTile() {
  if (state.robots) return;
  try {
    const r = await fetch('/robots.txt');
    const t = await r.text();
    state.robots = true;
    $('tile-robots').textContent = t.trim().split('\n').filter(Boolean).slice(0, 5).join('\n');
  } catch { /* leave the placeholder */ }
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

function signalList(quality) {
  const ul = el('ul', 'sigs');
  for (const sg of quality?.signals || []) {
    const li = el('li');
    const top = el('div', 'sig-top');
    top.append(el('span', '', sg.label), el('b', '', `${Math.round(sg.points * 10) / 10}/${sg.weight}`));
    const bar = el('div', `bar${(sg.value || 0) < 0.5 ? ' lo' : ''}`);
    const span = el('span');
    span.style.width = `${Math.round((sg.value || 0) * 100)}%`;
    bar.append(span);
    li.append(top, bar, el('p', 'small', sg.detail || ''));
    if (sg.evidence?.length) li.append(el('p', 'small mono', sg.evidence.join(' · ')));
    ul.append(li);
  }
  return ul;
}

function scoreClass(n) { return n >= 75 ? 'good' : n >= 50 ? 'warn' : 'bad'; }

function judgeBlock(r) {
  const box = el('div', 'judge');
  const h = el('div', 'sec-h');
  h.style.margin = '0';
  h.append(el('h2', '', 'AI judge'));
  box.append(h);
  if (!r.aiJudging) {
    h.append(el('span', 'tag warn', 'off on this server'));
    box.append(el('p', 'banner', 'AI judging is off on this server (no NEAR_AI_API_KEY). The score above is the deterministic content score.'));
    return box;
  }
  const j = r.judge;
  if (!j || j.error) {
    box.append(el('p', 'small', `AI judge did not return a score: ${j?.error || 'no reply'}. The content score still applies.`));
    return box;
  }
  const head = el('div', 'jhead');
  head.append(el('b', scoreClass(j.score), String(j.score)));
  head.append(el('p', 'small', `Scored against ${state.overview?.hackathon?.name || 'the hackathon'}'s judging criteria and rules by ${j.model}${j.cached ? ' (cached for this commit)' : ''}. It cites files; an uncited score is capped at 2/5. Shown beside the content score; it does not move the board.`));
  box.append(head);
  if (j.summary) box.append(el('p', '', j.summary));
  const ul = el('ul', 'results');
  for (const c of j.criteria || []) {
    const li = el('li');
    const top = el('div');
    top.append(el('span', `tag ${c.score >= 4 ? 'good' : c.score >= 3 ? 'warn' : 'bad'}`, `${c.score}/5`), el('span', '', ` ${c.label}`));
    li.append(top, el('p', 'small', c.reason || ''));
    if (c.evidence?.length) li.append(el('p', 'small mono', c.evidence.map((e) => `${e.path}${e.lines ? ':' + e.lines : ''}${e.note ? ' — ' + e.note : ''}`).join(' · ')));
    ul.append(li);
  }
  box.append(ul);
  return box;
}

function readinessBlock(rd, opts = {}) {
  const box = el('div', 'ready');
  box.append(el('h2', '', 'AI readiness'));
  if (!rd) {
    box.append(el('p', '', opts.empty || 'No live site found. Add a website link to the README (not a video or explorer link), or paste one in the site field.'));
    return box;
  }
  if (rd.error) { box.append(el('p', '', `Could not audit ${rd.url || 'the site'}: ${rd.error}`)); return box; }
  const all = (rd.sections || []).flatMap((x) => x.checks);
  const n = (st) => all.filter((c) => c.status === st).length;
  const head = el('div', 'rhead');
  head.append(el('b', scoreClass(rd.score), String(rd.score)));
  const side = el('div');
  const a = el('a', '', rd.finalUrl || rd.url); a.href = rd.finalUrl || rd.url; a.target = '_blank'; a.rel = 'noopener nofollow';
  side.append(a, el('p', '', 'Read without running JavaScript, the way AI crawlers and answer engines read it.' + (rd.cached ? ' Cached for 30 minutes.' : '')));
  const counts = el('div', 'rcount');
  counts.append(el('span', 'tag good', `${n('pass')} pass`), el('span', 'tag warn', `${n('warn')} warn`), el('span', 'tag bad', `${n('fail')} fail`));
  head.append(side, counts);
  box.append(head);
  const grid = el('div', 'ready-grid');
  for (const sec of rd.sections || []) {
    const cell = el('details', 'ready-sec');
    cell.open = true;
    const sum = el('summary');
    sum.append(el('span', '', sec.label), el('b', scoreClass(sec.score), String(sec.score)));
    const meter = el('div', 'meter');
    for (const c of sec.checks) meter.append(el('i', c.status === 'fail' ? 'f' : c.status === 'warn' ? 'w' : ''));
    cell.append(sum, meter);
    const ul = el('ul', 'results');
    const order = { fail: 0, warn: 1, pass: 2 };
    for (const c of [...sec.checks].sort((x, y) => order[x.status] - order[y.status])) {
      const li = el('li');
      const top = el('div');
      top.append(el('span', `tag ${c.status === 'fail' ? 'bad' : c.status === 'warn' ? 'warn' : 'good'}`, c.status), el('span', '', c.label));
      li.append(top);
      if (c.status !== 'pass' || c.detail) li.append(el('p', 'small', c.detail || ''));
      if (c.status !== 'pass' && c.fix) li.append(el('p', '', `Fix: ${c.fix}`));
      ul.append(li);
    }
    cell.append(ul);
    grid.append(cell);
  }
  box.append(grid);
  return box;
}

function paintRank(r) {
  const box = $('rank-out');
  box.replaceChildren();
  const card = el('section', 'rcard');
  const p = r.placement || {};
  const sc = el('div', `scorecard${r.score >= 75 ? '' : r.score >= 50 ? ' sc-warn' : ' sc-bad'}`);
  sc.append(el('b', '', String(r.score)));
  const meta = el('div');
  meta.append(el('div', 'sc-v', r.verdict || 'Content score'));
  meta.append(el('p', 'small', `Content score. Rules check ${r.rulesScore}/100 (${r.fails} failure(s), ${r.warns} warning(s)) counts for 10 of the 100 points. ${p.note || ''}`));
  if (r.directory) meta.append(el('p', 'small', `Directory: ${num(r.directory.total)} entries, ${num(r.directory.matched)} matched, ${num(r.directory.scored)} scored.`));
  sc.append(meta);
  const place = el('div', 'place');
  place.append(el('div', 'small', 'Estimated rank'));
  const pb = el('b', '', `${p.rank ?? '—'} `);
  pb.append(el('small', '', `of ${p.of ?? '—'}`));
  place.append(pb);
  const tracks = Object.entries(p.tracks || {});
  if (tracks.length) {
    const chips = el('div', 'chips');
    for (const [id, t] of tracks) chips.append(el('span', 'chip', `${trackName(id, state.overview?.hackathon?.tracks)} ${t.rank} of ${t.of}`));
    place.append(chips);
  }
  sc.append(place);
  card.append(sc);
  const h = el('div', 'sec-h');
  h.append(el('h2', '', 'What is inside'), el('span', 'small', `${(r.quality?.signals || []).length} signals · 100 points`));
  card.append(h, signalList(r.quality));
  card.append(judgeBlock(r));
  card.append(readinessBlock(r.readiness));
  const fh = el('div', 'sec-h');
  fh.append(el('h2', '', 'Fix these first'));
  card.append(fh, resultList((r.fixes || []).slice(0, 10)));
  box.append(card);
}

function startupBlock(st, label, link) {
  const box = el('div', 'startup');
  const head = el('div', 'shead');
  const left = el('div');
  left.append(el('h2', '', 'Startup lens'));
  const note = el('p', 'note');
  note.append(document.createTextNode(`${label || ''} `));
  if (link) { const a = el('a', '', 'Source'); a.href = link; a.target = '_blank'; a.rel = 'noopener'; note.append(a); }
  left.append(note);
  head.append(left);
  box.append(head);
  if (!st) { box.append(el('p', 'banner', 'The startup lens needs NEAR_AI_API_KEY on this server. It is off here.')); return box; }
  if (st.error) { box.append(el('p', 'banner', `Startup lens did not return: ${st.error}`)); return box; }
  head.append(el('b', '', String(st.score)));
  const grid = el('div', 'lens');
  for (const c of st.criteria || []) {
    const row = el('div', 'cri');
    row.append(el('b', '', `${c.score}/5`));
    const body = el('div');
    body.append(el('b', '', c.label));
    const dots = el('div', 'dots');
    for (let i = 1; i <= 5; i++) dots.append(el('i', i <= c.score ? 'on' : ''));
    body.append(dots, el('p', 'small', c.reason || ''));
    row.append(body);
    grid.append(row);
  }
  box.append(grid);
  if (st.biggestRisk || st.fix) {
    const risk = el('div', 'risk');
    const a = el('div'); a.append(el('span', 'k', 'BIGGEST RISK'), el('p', '', st.biggestRisk || '—'));
    const b = el('div'); b.append(el('span', 'k', 'FIX'), el('p', '', st.fix || '—'));
    risk.append(a, b);
    box.append(risk);
  }
  return box;
}

function paintIdea(r) {
  const box = $('idea-out');
  box.replaceChildren();
  const card = el('section', 'rcard');
  card.append(el('p', 'small', r.mode === 'ai'
    ? `${num(r.total)} entries. Ranked by word rarity (BM25), then the top 20 were re-read by a model for the same problem, user, or mechanism. Matches under 40/100 are dropped.`
    : `${num(r.total)} entries. Ranked by word rarity (BM25 over names and ${num(r.withDescriptions)} demo-post descriptions). Generic words like "agent" or "NEAR" barely count.${r.aiOn ? '' : ' AI re-ranking is off on this server.'}${r.rerankError ? ` Model re-rank failed: ${r.rerankError}.` : ''}`));
  if (!r.specific) card.append(el('p', 'banner', 'This sentence is mostly generic words. Name the user, the problem, and how it works, and the matches get meaningful.'));
  const h = el('div', 'sec-h');
  h.append(el('h2', '', 'Closest entries'), el('span', 'small', r.mode === 'ai' ? 'model re-ranked' : 'word rarity'));
  card.append(h);
  if (!r.similar?.length) card.append(el('p', 'empty', 'Nothing in the directory is close to this. That is a signal, not proof: the directory only shows names and demo posts.'));
  else {
    const list = el('div', 'matches');
    for (const s of r.similar) {
      const row = el('div', 'match');
      row.append(el('div', `s ${s.strength || 'weak'}`, String(Math.round((s.score || 0) * 100))));
      const body = el('div');
      body.append(el('b', '', s.name));
      const meta = [(s.trackLabels || []).join(', ')];
      if (s.reason) meta.push(s.reason);
      if (s.same?.length) meta.push(`same ${s.same.join(', ')}`);
      body.append(el('p', '', meta.filter(Boolean).join(' · ')));
      const hits = el('p');
      for (const ph of s.why?.phrases || []) hits.append(el('span', 'hl', ph));
      for (const w of s.why?.terms || []) hits.append(el('span', 'hl w', w));
      if (hits.childNodes.length) body.append(hits);
      row.append(body);
      list.append(row);
    }
    card.append(list);
  }
  const ch = el('div', 'sec-h');
  ch.append(el('h2', '', 'Crowding by track'), el('span', 'small', 'similar entries only'));
  card.append(ch);
  if (r.crowding?.length) {
    const grid = el('div', 'crowd');
    for (const t of r.crowding) {
      const c = el('div', 'cr');
      c.append(el('b', '', String(t.similar)), el('span', '', `similar of ${num(t.entries)} · ${t.label}`));
      grid.append(c);
    }
    card.append(grid);
  } else card.append(el('p', 'small', 'No track has a close match.'));
  const quiet = el('p', 'small');
  quiet.style.marginTop = '14px';
  quiet.append(document.createTextNode('Quietest tracks: '));
  for (const t of r.quiet || []) quiet.append(el('span', 'chip', `${t.label} · ${num(t.count)}`), document.createTextNode(' '));
  card.append(quiet);
  card.append(startupBlock(r.startup, r.startupLabel, r.startupLink));
  box.append(card);
}

function paintTriage(job) {
  const box = $('org-out');
  box.replaceChildren();
  const card = el('section', 'panel');
  card.append(el('p', '', job.done ? `Done. ${job.total} repositories.` : `Reading ${job.completed || 0} of ${job.total}.`));
  if (job.overflow) card.append(el('p', 'small', `${job.overflow} more URLs were past the 20-repository cap and were not read.`));
  if (job.error) card.append(el('p', 'err', job.error));
  const table = el('table');
  const head = el('thead');
  const hrow = el('tr');
  for (const h of ['#', 'Repository', 'Why', 'Content', 'AI ready', 'Flags']) hrow.append(el('th', '', h));
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
    const rd = item.readiness;
    const rdCell = el('td', '', rd?.score != null ? String(rd.score) : rd?.error ? 'unreachable' : 'no site');
    if (rd?.url) rdCell.title = rd.url + (rd.sections?.length ? '\n' + rd.sections.map((x) => `${x.label} ${x.score}`).join('\n') : '');
    tr.append(rdCell);
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
  $('rank-out').replaceChildren(el('div', 'empty', 'Cloning and reading the repository. This can take a minute. Nothing in it is executed.'));
  try { paintRank(await api('/api/rank', { repo: $('rank-repo').value.trim(), site: $('rank-site').value.trim() || undefined, tracks: checked('rank-tracks') })); }
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
  for (const k of ['projectName', 'nearAddress', 'idea', 'demoText', 'demoUrl', 'siteUrl']) if ($(k).value.trim()) submission[k] = $(k).value.trim();
  try {
    const r = await api('/api/check', { repo, submission });
    $('score').textContent = r.score;
    $('score').className = '';
    $('score').parentElement.className = `scorecard${r.score >= 75 ? '' : r.score >= 50 ? ' sc-warn' : ' sc-bad'}`;
    $('verdict').textContent = `${r.verdict} · content score`;
    $('counts').textContent = `Rules check ${r.rulesScore}/100: ${r.fails} failure(s), ${r.warns} warning(s), ${r.results.length - r.fails - r.warns} passed. ${r.aiJudging ? 'AI judging is available on Where do I rank.' : 'AI judging is off on this server.'} Directory size in this reading: ${num(r.directorySize)}.`;
    $('signals').replaceChildren(...signalList(r.quality).childNodes);
    $('results').replaceChildren(...resultList(r.results).childNodes);
    $('readiness').replaceChildren(readinessBlock(r.readiness));
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
  box.append(startupBlock(d.startup, d.startupLabel, d.startupLink));
  box.append(readinessBlock(d.readiness));
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

// Nav turns into a floating glass bar once the page scrolls.
const navEl = document.getElementById('nav');
const navOn = () => navEl && navEl.classList.toggle('on', window.scrollY > 8);
window.addEventListener('scroll', navOn, { passive: true });
navOn();
