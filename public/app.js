const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const show = (node, msg) => { if (!node) return; node.textContent = msg || ''; node.hidden = !msg; };
const num = (v) => v == null || Number.isNaN(Number(v)) ? '…' : Number(v).toLocaleString();
const API = window.DRYRUN_API || '';
const RPC = document.body.dataset.rpc || '';

const state = {
  overview: null, field: null, track: '', q: '', show: 40, showNames: false, quote: null, tokens: [],
  apiDown: false, showingRecorded: false, recorded: null,
  chain: {
    contractId: document.body.dataset.contract || '',
    rpcUrl: document.body.dataset.rpc || 'https://rpc.testnet.near.org',
    deployTx: document.body.dataset.deploy || '',
    explorerAccount: document.body.dataset.explorer || '',
  },
};

function apiOrigin() {
  return API || location.origin;
}

function apiDownMessage() {
  return `The API at ${apiOrigin()} did not answer this page. Render's free tier sleeps after about 15 minutes, and the deployed API sends no CORS header until the owner redeploys this branch.`;
}

async function api(path, body, options = {}) {
  const timeout = options.timeout ?? 12000;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(API + path, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const error = new Error(j.error || `HTTP ${r.status}`);
      error.status = r.status;
      if (!j.error && r.status >= 502) error.offline = true;
      throw error;
    }
    return j;
  } catch (error) {
    if (error.offline || (error.status && !error.offline)) throw error;
    const offline = new Error(apiDownMessage());
    offline.offline = true;
    throw offline;
  } finally {
    clearTimeout(timer);
  }
}

function showApiDown() {
  state.apiDown = true;
  const banner = $('api-banner');
  if (banner) banner.hidden = false;
  const text = $('api-banner-text');
  if (text) text.textContent = apiDownMessage();
  const retry = $('api-retry');
  if (retry) {
    retry.disabled = false;
    retry.textContent = 'Wake / retry';
  }
  if ($('field-scan')) $('field-scan').textContent = 'The API did not answer. This is not a live directory.';
  if ($('field-coverage')) $('field-coverage').textContent = 'No directory was loaded.';
  const board = $('board-banner-text');
  if (board && !state.field?.board?.length) board.textContent = 'Directory not loaded. The API did not answer, so this is not a live reading.';
  const tag = $('board-banner')?.querySelector('.tag');
  if (tag && !state.field?.board?.length) tag.textContent = 'NO API';
  const body = $('board-body');
  if (body && !state.field?.board?.length) {
    const tr = el('tr');
    const td = el('td', '', 'The directory was not loaded. Nothing here is a sample team.');
    td.colSpan = 6;
    tr.append(td);
    body.replaceChildren(tr);
  }
}

function clearRecorded() {
  state.showingRecorded = false;
  if ($('recorded-pill')) $('recorded-pill').hidden = true;
  if ($('recorded-flag')) $('recorded-flag').hidden = true;
}

function showRecorded(record) {
  if (!record || record.recorded !== true) return;
  state.recorded = record;
  state.showingRecorded = true;
  const slug = String(record.repo || '').replace('https://github.com/', '');
  if ($('repo') && !$('repo').value.trim()) $('repo').value = slug;
  if ($('recorded-pill')) $('recorded-pill').hidden = false;
  const flag = $('recorded-flag');
  if (flag) {
    flag.hidden = false;
    flag.replaceChildren(el('span', 'tag', 'RECORDED'));
    const text = el('span', '', `Stored result for ${slug}. Score ${record.score}. Not a live check.`);
    text.id = 'recorded-flag-text';
    flag.append(text);
    if (record.receipt?.explorerTx) {
      const link = el('a', '', 'on-chain receipt');
      link.href = record.receipt.explorerTx;
      link.target = '_blank';
      link.rel = 'noreferrer';
      flag.append(link);
    }
  }
  paintCheck({ ...record, recorded: true, receipt: record.receipt, receiptError: null });
}

function repoUrl(raw) {
  const text = String(raw || '').trim();
  const short = text.replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/$/, '');
  if (/^[\w.-]+\/[\w.-]+$/.test(short)) return `https://github.com/${short}`;
  return text;
}

function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return value ? `≈ ${value}` : '—';
  return `≈ ${n.toFixed(2)}`;
}

function shortTx(tx) {
  if (!tx || tx.length < 24) return tx || '';
  return `${tx.slice(0, 8)}…${tx.slice(-16)}`;
}

function trackName(id, tracks) {
  return (tracks || []).find((t) => t.id === id)?.label || id;
}

function trackList(ids, tracks) {
  return (ids || []).map((id) => trackName(id, tracks)).join(' · ');
}

async function rpcView(method, args) {
  const chain = state.chain;
  if (!chain?.contractId) return null;
  const response = await fetch(chain.rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 'dryrun', method: 'query',
      params: {
        request_type: 'call_function', finality: 'final', account_id: chain.contractId,
        method_name: method, args_base64: btoa(JSON.stringify(args || {})),
      },
    }),
  });
  const body = await response.json();
  if (body.error || body.result?.error) return null;
  const text = new TextDecoder().decode(new Uint8Array(body.result?.result || []));
  return text ? JSON.parse(text) : null;
}

function setView(name) {
  const view = name === 'deep' ? 'check' : (name || 'check');
  for (const node of document.querySelectorAll('[data-view]')) node.hidden = node.dataset.view !== view;
  for (const a of document.querySelectorAll('nav.tabs a[data-go]')) a.classList.toggle('on', a.dataset.go === (name === 'deep' ? 'deep' : view));
  if (name === 'deep') document.getElementById('deep-card')?.scrollIntoView({ block: 'center' });
  if (view === 'field') refreshField();
  if (view === 'check') refreshBoard();
}

function route() {
  const raw = (location.hash || '#check').replace('#', '') || 'check';
  const known = ['check', 'rank', 'idea', 'field', 'deep', 'organizers', 'home'];
  setView(raw === 'home' || raw === 'pricing' ? 'check' : (known.includes(raw) ? raw : 'check'));
}

function ruleRow(level, title, tag) {
  const row = el('div', 'rule');
  const mark = level === 'fail' ? 'no' : level === 'warn' ? 'w' : 'ok';
  const glyph = level === 'fail' ? '✕' : level === 'warn' ? '!' : '✓';
  row.append(el('span', `st ${mark}`, glyph), document.createTextNode(title), el('span', 'q', tag || ''));
  return row;
}

function paintCheck(r) {
  const results = r.results || [];
  const pass = results.filter((x) => x.level === 'pass').length;
  const warn = results.filter((x) => x.level === 'warn').length;
  const fail = results.filter((x) => x.level === 'fail').length;
  $('score-block').hidden = false;
  $('check-empty').hidden = true;
  const pct = Math.max(0, Math.min(100, Number(r.score) || 0));
  $('ring').style.background = `conic-gradient(var(--tx) 0 ${pct}%, #262626 ${pct}% 100%)`;
  $('score').textContent = String(r.score);
  const warnLabel = warn === 1 ? 'warning' : 'warnings';
  const failLabel = fail === 1 ? 'failure' : 'failures';
  $('counts').textContent = `${pass} pass · ${warn} ${warnLabel} · ${fail} ${failLabel}`;
  const sha = (r.sha || '').slice(0, 12);
  $('score-meta').textContent = r.recorded
    ? `Recorded commit ${sha} · content score out of 100 · ${results.length} rule rows from that stored run`
    : `commit ${sha} · content score out of 100 · ${results.length} rule rows from this run`;
  if (!r.recorded) clearRecorded();
  const order = { fail: 0, warn: 1, pass: 2 };
  const rules = $('rules');
  rules.replaceChildren(...[...results].sort((a, b) => order[a.level] - order[b.level]).map((x) => {
    const row = ruleRow(x.level, x.title, x.id);
    if (x.detail) row.title = x.detail;
    return row;
  }));
  const extra = $('extra');
  extra.replaceChildren();
  if (r.readiness && !r.readiness.error) {
    const worst = (r.readiness.sections || []).flatMap((s) => s.checks || []).some((c) => c.status === 'fail') ? 'fail'
      : (r.readiness.sections || []).flatMap((s) => s.checks || []).some((c) => c.status === 'warn') ? 'warn' : 'pass';
    extra.append(ruleRow(worst, `AI readiness ${r.readiness.score} · ${r.readiness.finalUrl || r.readiness.url || 'live site'}`, 'readiness'));
  } else if (r.readiness?.error) {
    extra.append(ruleRow('warn', `AI readiness: ${r.readiness.error}`, 'readiness'));
  }
  if (r.quality?.signals?.length) {
    const details = el('details', 'more');
    details.append(el('summary', '', 'Content signals'));
    const list = el('div', 'rules');
    for (const sg of r.quality.signals) list.append(ruleRow((sg.value || 0) >= 0.5 ? 'pass' : 'warn', `${sg.label} · ${sg.points}/${sg.weight}`, 'content'));
    details.append(list);
    extra.append(details);
  }
  window.__repo = r.recorded ? '' : (r.repo || repoUrl($('repo').value));
  paintReceiptStrip(r);
  if (r.receipt) paintVerify(r.receipt, { matched: !r.recorded && r.receipt.result_hash === r.resultHash, recorded: Boolean(r.recorded) });
}

function paintReceiptStrip(r) {
  const line = $('receipt-line');
  const link = $('receipt-link');
  if (r.receipt?.txHash) {
    line.replaceChildren();
    if (r.recorded) line.append('Recorded receipt ', el('b', '', `#${r.receipt.id}`), ' · tx ', el('b', '', shortTx(r.receipt.txHash)));
    else line.append('Receipt ', el('b', '', `#${r.receipt.id}`), ' written · tx ', el('b', '', shortTx(r.receipt.txHash)));
    link.hidden = false;
    link.href = r.recorded && r.receipt.explorerTx ? r.receipt.explorerTx : `/verify?id=${r.receipt.id}`;
    link.textContent = r.recorded ? 'on-chain receipt →' : `open /verify?id=${r.receipt.id} →`;
    if (r.recorded) { link.target = '_blank'; link.rel = 'noreferrer'; }
    else { link.removeAttribute('target'); link.removeAttribute('rel'); }
  } else {
    line.textContent = r.receiptError || 'No receipt was written.';
    link.hidden = true;
  }
}

function paintVerify(receipt, { matched = false, recorded = false } = {}) {
  if (!receipt) return;
  $('verify-title').textContent = `/verify?id=${receipt.id}`;
  $('verify-kind').textContent = `kind: ${receipt.kind || '—'}`;
  const kv = el('div', 'kv');
  const rows = [
    ['repo', String(receipt.repo_url || '').replace(/^https:\/\//, '')],
    ['commit', receipt.commit_sha],
    ['result hash', receipt.result_hash],
    ['checker', receipt.checker_version],
    ['contract', state.chain?.contractId || receipt.recorder || ''],
  ];
  if (receipt.quote_hash) rows.push(['quote hash', receipt.quote_hash]);
  for (const [label, value] of rows) kv.append(el('div', 'l', label), el('div', 'v', value || '—'));
  const box = el('div');
  box.append(kv);
  if (recorded) {
    const note = el('p', 'muted');
    note.style.marginTop = '14px';
    note.textContent = 'Recorded result. This page did not re-check the repository. The hash is the one stored on testnet.';
    box.append(note);
  } else if (matched) {
    const note = el('div', 'verified');
    note.append(el('span', 'tick', '✓'));
    const copy = el('div');
    copy.append(el('b', '', 'Hash matches a fresh run.'));
    copy.append(document.createElement('br'));
    const small = el('span', '', 'No signer needed. Anyone can repeat this view call.');
    small.style.color = 'var(--mu)';
    copy.append(small);
    note.append(copy);
    box.append(note);
  } else {
    const note = el('p', 'muted');
    note.style.marginTop = '14px';
    note.textContent = 'Read from testnet. Run the same repo to compare a fresh hash.';
    box.append(note);
  }
  $('verify-body').replaceChildren(box);
}

function confClass(row) {
  return row.confidence === 'high' ? 'conf h' : 'conf';
}

function paintMiniBoard(f) {
  state.field = f;
  const rows = [...(f?.board || [])].sort((a, b) => a.rank - b.rank).slice(0, 5);
  const banner = $('board-banner-text');
  const body = $('board-body');
  if (!rows.length) {
    $('board-banner').querySelector('.tag').textContent = 'EXAMPLE';
    banner.textContent = 'No scored repositories in this reading. These are not sample teams.';
    const tr = el('tr');
    const td = el('td', '', 'The estimate is empty until the directory scan scores a public repo.');
    td.colSpan = 6;
    tr.append(td);
    body.replaceChildren(tr);
    return;
  }
  $('board-banner').querySelector('.tag').textContent = 'ESTIMATE';
  banner.textContent = f.estimateLabel || 'Not the official result · team and repo names anonymised';
  const tracks = f.tracks || state.overview?.hackathon?.tracks || [];
  body.replaceChildren(...rows.map((r) => {
    const tr = el('tr');
    tr.append(el('td', 'm', String(state.showNames && r.trackRanks ? r.rank : r.rank)));
    tr.append(el('td', 'm', r.name));
    tr.append(el('td', 'm', r.anonymised ? (r.repoAlias || '—') : String(r.repo || '—').replace('https://github.com/', '')));
    tr.append(el('td', '', trackList(r.tracks, tracks).toLowerCase() || '—'));
    const score = el('td');
    const bar = el('span', 'bar');
    bar.append(el('i'));
    bar.firstChild.style.width = `${Math.max(0, Math.min(100, r.score || 0))}%`;
    score.append(bar, document.createTextNode(String(r.score)));
    tr.append(score);
    const match = el('td');
    const label = r.confidence === 'high' ? 'high' : r.confidence === 'medium' ? 'medium' : (r.confidence || '—');
    match.append(el('span', confClass(r), label));
    tr.append(match);
    return tr;
  }));
}

async function refreshBoard() {
  try { paintMiniBoard(await api('/api/field' + (state.showNames ? '?names=1' : ''))); }
  catch (error) {
    if (error.offline) showApiDown();
    else if ($('board-banner-text')) $('board-banner-text').textContent = error.message;
  }
}

function paintField(f) {
  state.field = f;
  if ($('field-banner') && f?.estimateLabel) $('field-banner').textContent = f.estimateLabel;
  $('field-scan').textContent = f?.scan?.phase ? `Scan: ${f.scan.phase}${f.scan.error ? ' · ' + f.scan.error : ''}` : '';
  const c = f?.coverage;
  $('field-coverage').textContent = f?.ready && c
    ? `${num(f.total)} entries · matched ${num(c.matched)} · scored ${num(c.scored)}`
    : 'The directory has not been read yet.';
  const tracks = f?.tracks || [];
  const table = el('table');
  const head = el('thead');
  const hr = el('tr');
  for (const h of ['Track', 'Entries', 'Share', 'Room']) hr.append(el('th', '', h));
  head.append(hr);
  const tb = el('tbody');
  for (const t of tracks) {
    const tr = el('tr');
    tr.append(el('td', '', t.label), el('td', 'm', num(t.count)), el('td', 'm', `${Math.round((t.share || 0) * 100)}%`), el('td', '', t.room || ''));
    tb.append(tr);
  }
  table.append(head, tb);
  $('field-tracks').replaceChildren(table);
  const clusters = $('field-clusters');
  clusters.replaceChildren();
  const groups = [...(f?.clusters?.tokens || []), ...(f?.clusters?.names || [])].slice(0, 12);
  if (!groups.length) clusters.append(el('p', 'muted', 'None in this reading.'));
  else clusters.append(el('p', 'mono', groups.map((g) => `${g.label} · ${g.count}`).join('   ')));
  const sel = $('field-track');
  const current = state.track;
  sel.replaceChildren(el('option', '', 'All scored'), ...[...tracks].sort((a, b) => a.label.localeCompare(b.label)).map((t) => {
    const o = el('option', '', t.label);
    o.value = t.id;
    return o;
  }));
  sel.value = current;
  paintFullBoard(f);
}

function paintFullBoard(f) {
  let rows = [...(f?.board || [])];
  if (state.track) rows = rows.filter((r) => (r.tracks || []).includes(state.track));
  const q = state.q.trim().toLowerCase();
  if (q) rows = rows.filter((r) => `${r.name} ${r.repo || ''} ${r.repoAlias || ''}`.toLowerCase().includes(q));
  rows.sort((a, b) => a.rank - b.rank);
  const shown = rows.slice(0, state.show);
  const body = $('field-body');
  if (!shown.length) {
    const tr = el('tr');
    const td = el('td', '', f?.ready ? 'No scored repository in this filter. Nothing here is an example row.' : 'Waiting for the directory.');
    td.colSpan = 7;
    tr.append(td);
    body.replaceChildren(tr);
  } else {
    body.replaceChildren(...shown.map((r) => {
      const tr = el('tr');
      tr.append(el('td', 'm', String(r.rank)));
      tr.append(el('td', 'm', r.name));
      tr.append(el('td', '', trackList(r.tracks, f.tracks)));
      tr.append(el('td', 'm', String(r.score)));
      tr.append(el('td', 'm', String(r.fails ?? 0)));
      tr.append(el('td', '', r.confidence || '—'));
      tr.append(el('td', 'm', r.anonymised ? (r.repoAlias || 'hidden') : String(r.repo || '—').replace('https://github.com/', '')));
      return tr;
    }));
  }
  $('field-count').textContent = `${shown.length} of ${rows.length} shown. ${f?.board?.length || 0} scored.`;
  $('field-more').hidden = shown.length >= rows.length;
  if ($('field-q')) $('field-q').placeholder = state.showNames ? 'Project or repository' : 'Alias';
}

async function refreshField() {
  try { paintField(await api('/api/field' + (state.showNames ? '?names=1' : ''))); }
  catch (error) { $('field-scan').textContent = error.message; }
}

function checked(id) {
  return [...document.querySelectorAll(`#${id} input:checked`)].map((c) => c.value);
}

function fillTracks(container, tracks) {
  if (!container) return;
  container.replaceChildren(...(tracks || []).map((t) => {
    const label = el('label');
    const input = el('input');
    input.type = 'checkbox';
    input.value = t.id;
    label.append(input, document.createTextNode(t.label || t.id));
    return label;
  }));
}

function resultList(results) {
  const box = el('div', 'rules');
  const order = { fail: 0, warn: 1, pass: 2 };
  for (const x of [...(results || [])].sort((a, b) => order[a.level] - order[b.level])) box.append(ruleRow(x.level, x.title, x.id));
  return box;
}

function paintRank(r) {
  const box = $('rank-out');
  box.replaceChildren();
  const p = r.placement || {};
  box.append(el('p', 'score-copy', `Content score ${r.score}`));
  box.append(el('p', 'muted', p.note || ''));
  box.append(el('p', '', `Estimated rank ${p.rank ?? '—'} of ${p.of ?? '—'}`));
  for (const [id, t] of Object.entries(p.tracks || {})) {
    box.append(el('p', 'mono', `${trackName(id, state.overview?.hackathon?.tracks)} ${t.rank} of ${t.of}`));
  }
  if (!r.aiJudging) box.append(el('p', 'muted', 'AI judging is off on this server. The rank uses the content score.'));
  else if (r.judge?.error) box.append(el('p', 'muted', r.judge.error));
  else if (r.judge) box.append(el('p', '', `AI judge ${r.judge.score} · ${r.judge.model || ''}`));
  box.append(el('h3', '', 'Fixes'), resultList(r.fixes || r.results || []));
}

function paintIdea(r) {
  const box = $('idea-out');
  box.replaceChildren();
  box.append(el('p', 'muted', r.mode === 'ai' ? 'Re-read by the model.' : `Word match.${r.aiOn ? '' : ' AI re-rank is off.'}`));
  if (!r.similar?.length) box.append(el('p', '', 'Nothing in the directory is close.'));
  else {
    for (const s of r.similar) {
      box.append(el('p', '', `${s.name} · ${Math.round((s.score || 0) * 100)} · ${(s.trackLabels || []).join(', ')}`));
      if (s.reason || s.why) box.append(el('p', 'muted', s.reason || (s.why?.terms || []).join(' ')));
    }
  }
  if (r.startup?.score != null) box.append(el('p', '', `Startup lens ${r.startup.score}`));
  else box.append(el('p', 'muted', 'Startup lens is off without NEAR_AI_API_KEY.'));
}

function paintTriage(job) {
  const box = $('org-out');
  box.replaceChildren();
  box.append(el('p', '', job.done ? `Done. ${job.total} repositories.` : `Reading ${job.completed || 0} of ${job.total}.`));
  const table = el('table');
  const head = el('thead');
  const hr = el('tr');
  for (const h of ['#', 'Repository', 'Score', 'Flags']) hr.append(el('th', '', h));
  head.append(hr);
  const tb = el('tbody');
  (job.items || []).forEach((item, i) => {
    const tr = el('tr');
    const flags = item.error ? 'will not clone' : Object.entries(item.flags || {}).filter(([, v]) => v === 'fail').map(([k]) => k).join(', ');
    tr.append(el('td', 'm', String(i + 1)), el('td', 'mono', item.repo), el('td', 'm', item.score == null ? '—' : String(item.score)), el('td', '', flags || '—'));
    tb.append(tr);
  });
  table.append(head, tb);
  box.append(table);
}

function paintChains(tokens) {
  const want = ['base', 'eth', 'arb', 'sol'];
  const label = { base: 'Base', eth: 'Ethereum', arb: 'Arbitrum', sol: 'Solana' };
  const picks = [];
  for (const chain of want) {
    const token = tokens.find((t) => t.symbol === 'USDC' && t.blockchain === chain);
    if (token) picks.push(token);
  }
  const box = $('chains');
  if (!picks.length) {
    box.replaceChildren(el('span', 'muted', 'Token list unavailable.'));
    return;
  }
  state.asset = picks[0].assetId;
  box.replaceChildren(...picks.map((token, i) => {
    const b = el('button', i === 0 ? 'on' : '', label[token.blockchain] || token.blockchain);
    b.type = 'button';
    b.addEventListener('click', () => {
      state.asset = token.assetId;
      for (const node of box.querySelectorAll('button')) node.classList.remove('on');
      b.classList.add('on');
      $('quote-unit').textContent = `${token.symbol} on ${label[token.blockchain] || token.blockchain}`;
    });
    return b;
  }));
  $('quote-unit').textContent = `${picks[0].symbol} on ${label[picks[0].blockchain] || picks[0].blockchain}`;
}

function paintQuote(q, label) {
  state.quote = q;
  const amount = q.amountInFormatted || q.amountInUsd || q.amount;
  $('quote-amt').textContent = money(amount);
  if (label) $('quote-unit').textContent = label;
  $('note-deposit').hidden = false;
  $('quote').textContent = 'Record this dry quote';
  $('quote-tx').textContent = q.quoteHash ? `quote ${q.quoteHash}` : '';
}

function paintDeep(d) {
  const box = $('review');
  box.replaceChildren();
  const ai = $('ai-note');
  if (!d.aiCalled) ai.innerHTML = 'NEAR AI model <b>not called</b> (no key set)';
  else ai.textContent = `Model ${d.model || ''} returned a review.`;
  if (d.review?.summary) box.append(el('p', '', d.review.summary));
  if (d.aiError && !d.review) box.append(el('p', 'muted', d.aiError));
  if (d.receipt) {
    $('quote').textContent = `Recorded → receipt #${d.receipt.id}`;
    $('quote-tx').textContent = d.receipt.txHash ? `tx ${d.receipt.txHash}` : '';
    paintVerify(d.receipt, { matched: true });
    paintReceiptStrip({ receipt: d.receipt });
  }
}

$('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  show($('err'));
  $('go').disabled = true;
  $('go').textContent = 'Checking…';
  const submission = { tracks: checked('tracks') };
  for (const k of ['projectName', 'nearAddress', 'idea', 'demoText', 'demoUrl', 'siteUrl']) if ($(k).value.trim()) submission[k] = $(k).value.trim();
  try {
    const result = await api('/api/check', { repo: repoUrl($('repo').value), submission });
    state.apiDown = false;
    if ($('api-banner')) $('api-banner').hidden = true;
    paintCheck(result);
  } catch (error) {
    if (error.offline) {
      showApiDown();
      if (state.recorded) showRecorded(state.recorded);
      show($('err'), 'This check did not run. The API did not answer. The score on this card is the recorded check of near-examples/rust-status-message.');
    } else show($('err'), error.message);
  }
  $('go').disabled = false;
  $('go').textContent = 'Check';
});

$('quote').addEventListener('click', async () => {
  show($('perr'));
  $('quote').disabled = true;
  try {
    if (!state.quote) {
      if (!$('refund').value.trim()) throw new Error('Enter a refund address so 1Click can price the route. It is not charged.');
      const q = await api('/api/quote', { originAsset: state.asset, refundTo: $('refund').value.trim() });
      paintQuote(q, $('quote-unit').textContent);
      return;
    }
    if (!window.__repo) throw new Error('Run a free check first so the receipt has a repository.');
    $('quote').textContent = 'Recording…';
    paintDeep(await api('/api/deep', { repo: window.__repo, quoteId: state.quote.quoteId }));
    state.quote = null;
    await refreshStats();
  } catch (error) {
    if (error.offline) showApiDown();
    show($('perr'), error.offline ? 'The dry quote did not run. The API did not answer.' : error.message);
    $('quote').textContent = state.quote ? 'Record this dry quote' : 'Get a dry quote';
  } finally { $('quote').disabled = false; }
});

$('field-names').addEventListener('click', () => {
  state.showNames = !state.showNames;
  $('names-sw').classList.toggle('on', state.showNames);
  refreshBoard();
  if (!$('field-body').closest('[data-view]').hidden) refreshField();
});

$('rank-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  show($('rank-err'));
  $('rank-go').disabled = true;
  $('rank-out').replaceChildren(el('p', 'muted', 'Cloning and reading. Nothing is executed.'));
  try { paintRank(await api('/api/rank', { repo: repoUrl($('rank-repo').value), site: $('rank-site').value.trim() || undefined, tracks: checked('rank-tracks') })); }
  catch (error) {
    if (error.offline) showApiDown();
    show($('rank-err'), error.offline ? 'The rank did not run. The API did not answer.' : error.message);
  }
  $('rank-go').disabled = false;
});

$('idea-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  show($('idea-err'));
  $('idea-go').disabled = true;
  try { paintIdea(await api('/api/idea', { text: $('idea-text').value.trim() })); }
  catch (error) {
    if (error.offline) showApiDown();
    show($('idea-err'), error.offline ? 'The idea check did not run. The API did not answer.' : error.message);
  }
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
  } catch (error) {
    if (error.offline) showApiDown();
    show($('org-err'), error.offline ? 'Triage did not run. The API did not answer.' : error.message);
    $('org-go').disabled = false;
  }
});

$('field-track').addEventListener('change', () => { state.track = $('field-track').value; state.show = 40; if (state.field) paintFullBoard(state.field); });
$('field-q').addEventListener('input', () => { state.q = $('field-q').value; state.show = 40; if (state.field) paintFullBoard(state.field); });
$('field-more').addEventListener('click', () => { state.show += 40; if (state.field) paintFullBoard(state.field); });

async function refreshStats() {
  try {
    const chain = await api('/api/chain');
    state.chain = chain;
    if (chain.receiptCount != null) $('stat-receipts').textContent = String(chain.receiptCount);
    const tx = chain.deployTx || '';
    if (tx) {
      $('deploy-short').textContent = shortTx(tx);
      if (chain.explorerAccount) $('deploy-link').href = `https://explorer.testnet.near.org/transactions/${tx}`;
    }
  } catch { /* leave the placeholder */ }
}

async function loadReceiptOne() {
  try {
    const receipt = await api('/api/receipt?id=1');
    paintVerify(receipt, { matched: false });
  } catch {
    try {
      const receipt = await rpcView('get_receipt', { id: 1 });
      if (receipt) paintVerify(receipt, { matched: false });
      else $('verify-body').replaceChildren(el('p', 'muted', 'Receipt 1 is not on this contract yet.'));
    } catch {
      $('verify-body').replaceChildren(el('p', 'muted', 'Could not read the contract.'));
    }
  }
}

function applyMeta(meta) {
  state.overview = meta;
  if (meta.priceUsd != null && $('price')) $('price').textContent = String(meta.priceUsd);
  if ($('ai-note')) {
    $('ai-note').innerHTML = meta.ai
      ? 'NEAR AI model <b>will be called</b> when the quote is recorded'
      : 'NEAR AI model <b>not called</b> (no key set)';
  }
  fillTracks($('tracks'), meta.hackathon?.tracks || []);
  fillTracks($('rank-tracks'), meta.hackathon?.tracks || []);
}

function paintDeployLink() {
  const tx = state.chain?.deployTx || '';
  if (!tx || !$('deploy-short')) return;
  $('deploy-short').textContent = shortTx(tx);
  if ($('deploy-link')) $('deploy-link').href = `https://explorer.testnet.near.org/transactions/${tx}`;
}

async function loadRecorded() {
  try {
    const response = await fetch('/recorded-check.json', { cache: 'no-store' });
    if (!response.ok) return null;
    const data = await response.json();
    if (data?.recorded !== true || data.score !== 55 || !data.receipt?.explorerTx) return null;
    return data;
  } catch {
    return null;
  }
}

async function readReceiptCount() {
  const count = await rpcView('receipt_count', {});
  if (typeof count === 'number') $('stat-receipts').textContent = String(count);
  else if (typeof count === 'string' && /^\d+$/.test(count)) $('stat-receipts').textContent = count;
}

function hideRecordedScore() {
  const was = state.showingRecorded;
  clearRecorded();
  if (!was) return;
  $('score-block').hidden = true;
  $('check-empty').hidden = false;
  $('rules').replaceChildren();
  $('extra').replaceChildren();
  $('receipt-line').textContent = 'Receipt is written when the testnet signer is set.';
  $('receipt-link').hidden = true;
  $('verify-body').replaceChildren(el('p', 'muted', 'Reading the contract…'));
}

async function wakeApi() {
  const button = $('api-retry');
  if (button) {
    button.disabled = true;
    button.textContent = 'Waking…';
  }
  if ($('api-banner-text')) $('api-banner-text').textContent = `Asking ${apiOrigin()} again. A cold start can take about a minute. If this deploy still sends no CORS header, the browser blocks the response after the process is awake.`;
  try {
    const meta = await api('/api/meta', undefined, { timeout: 50000 });
    state.apiDown = false;
    if ($('api-banner')) $('api-banner').hidden = true;
    hideRecordedScore();
    applyMeta(meta);
    refreshBoard();
    refreshStats().then(loadReceiptOne);
    api('/api/tokens').then((tokens) => {
      if (tokens.priceUsd != null) $('price').textContent = String(tokens.priceUsd);
      paintChains(tokens.tokens || []);
    }).catch(() => paintChains([]));
  } catch {
    showApiDown();
    if ($('api-banner-text')) $('api-banner-text').textContent = `${apiDownMessage()} Still no response.`;
  }
}

if ($('api-retry')) $('api-retry').addEventListener('click', wakeApi);

async function boot() {
  paintDeployLink();
  state.recorded = await loadRecorded();
  try {
    const meta = await api('/api/meta', undefined, { timeout: 8000 });
    state.apiDown = false;
    applyMeta(meta);
    api('/api/tokens').then((tokens) => {
      if (tokens.priceUsd != null) $('price').textContent = String(tokens.priceUsd);
      paintChains(tokens.tokens || []);
    }).catch(() => paintChains([]));
    refreshBoard();
    refreshStats().then(loadReceiptOne);
  } catch (error) {
    if (!error.offline) return;
    showApiDown();
    paintChains([]);
    if (state.recorded) showRecorded(state.recorded);
    else if ($('check-empty')) $('check-empty').textContent = 'The API did not answer, and the recorded check file did not load.';
    try { await readReceiptCount(); } catch { /* leave the placeholder */ }
    try {
      const receipt = await rpcView('get_receipt', { id: 1 });
      if (receipt) paintVerify(receipt, { recorded: true });
    } catch { /* the recorded card still links the transaction */ }
  }
}

window.addEventListener('hashchange', route);
route();
boot();
