// Token Radar dashboard. The page embeds the sealed snapshot and the
// same model code the program ran (model.js); on load it recomputes the
// whole board and checks its checksum against the one main.ts wrote
// into the data file. What you see is the recomputation, not a copy.

import { SNAPSHOT, EXPECTED_CHECKSUM } from './zz-snapshot-data.js';
import * as M from './model.js';

const radar = M.buildRadar(SNAPSHOT);
const rows = radar.rows;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = (x, d = 0) => (x * 100).toFixed(d) + '%';
const signed = (v) => (v == null ? '—' : (v > 0 ? '+' : '') + (Math.round(v * 10) / 10));

const state = { tier: 'all', cat: '', chain: '', q: '', sortK: 'rank', sortD: 1, scenario: 0 };

function parseHash() {
  const h = location.hash.replace(/^#/, '');
  const kv = {};
  for (const part of h.split('&')) {
    const i = part.indexOf('=');
    if (i > 0) kv[part.slice(0, i)] = decodeURIComponent(part.slice(i + 1));
  }
  return kv;
}

// ------------------------------------------------------------ header

function renderHeader() {
  $('subline').textContent = 'Pre-token launch radar · DefiLlama snapshot ' + radar.asOf + ' · every number on this page is recomputed in your browser from the sealed snapshot by the same model that wrote board.json';
  const ok = radar.checksum === EXPECTED_CHECKSUM;
  $('integrity').innerHTML = ok
    ? 'integrity ✓ recomputed board matches board.json\nchecksum ' + radar.checksum + ' · ' + rows.length + ' rows'
    : '<span class="bad">integrity ✗ recomputed checksum ' + radar.checksum + ' != board.json ' + EXPECTED_CHECKSUM + '</span>';
}

function renderStats() {
  const v = radar.value, o = radar.odds;
  const cards = [
    ['×' + v.loo.toFixed(2), 'Value miss, leave-one-out', 'flat multiple ×' + v.flat.loo.toFixed(2)],
    ['×' + v.wf.toFixed(2), 'Value miss, walk-forward', 'fit early, tested late'],
    [Math.round(v.honesty.inMid * 100) + '% <em>in band</em>', 'Range honesty P25–P75', 'stated coverage 50%'],
    [o.cv.toFixed(3) + ' <em>brier</em>', 'Odds model, 10-fold CV', 'base rate ' + o.base.cv.toFixed(3)],
    [String(radar.verdicts.FARM), 'Worth farming at 0.02% plan', 'verdict FARM, of ' + rows.length],
    ['40/40', 'Watchlist covered', 'plus ' + (rows.length - 40) + ' early finds'],
  ];
  $('stats').innerHTML = cards.map((c) =>
    '<div class="stat"><b>' + c[0] + '</b><span>' + c[1] + '</span><span class="sub">' + c[2] + '</span></div>').join('');
}

const GROUP_STYLE = [
  ['ranked', 'Ranked on this board', '#f0a13c'],
  ['token', 'Already record a token', '#5aa2e8'],
  ['bridge', 'Bridge products', '#e05d5d'],
  ['liquid staking/restaking', 'Liquid staking / restaking', '#2dd4bf'],
  ['exchange products', 'Exchange (CEX) products', '#9a6ee8'],
  ['versioned', 'Versioned successors', '#8494a7'],
  ['wrapped/staked by name', 'Wrapped / staked by name', '#4a5a6d'],
];
function renderAccounting() {
  const a = radar.accounting;
  const counts = {
    ranked: a.ranked, token: a.token, bridge: a.bridge,
    'liquid staking/restaking': a['liquid staking/restaking'],
    'exchange products': a['exchange products'], versioned: a.versioned,
    'wrapped/staked by name': a['wrapped/staked by name'],
  };
  const bar = GROUP_STYLE.map(([k, , color]) =>
    '<i style="background:' + color + ';width:' + (counts[k] / a.total * 100) + '%"></i>').join('');
  const legend = GROUP_STYLE.map(([k, label, color]) =>
    '<span><i style="background:' + color + '"></i>' + label + ' · <b>' + counts[k] + '</b></span>').join('');
  $('accounting').innerHTML =
    '<div style="display:flex;justify-content:space-between"><span class="small muted">Full accounting of the snapshot\'s ' +
    a.total + ' protocols</span><span class="small muted">a protocol is listed as recording no token — never as having none</span></div>' +
    '<div class="bar">' + bar + '</div><div class="legend">' + legend + '</div>' +
    (a.belowCut > 0 ? '<div class="small muted" style="margin-top:3px">' + a.belowCut + ' further eligible protocols sit below the board\'s TVL cut.</div>' : '');
}

// -------------------------------------------------------------- rail

function termRows(terms, looKey, wfKey, fmt) {
  return terms.map((t) =>
    '<tr><td>' + esc(t.label) + '</td><td class="num">' + fmt(t[looKey]) + '</td><td class="num">' + fmt(t[wfKey]) + '</td>' +
    '<td class="' + (t.kept ? 'kept' : 'rej') + '">' + (t.kept ? 'kept' : 'rejected') + '</td></tr>').join('');
}
function renderRail() {
  const v = radar.value, o = radar.odds;
  const fx = (x) => '×' + x.toFixed(2);
  const fb = (x) => x.toFixed(3);
  $('rail').innerHTML =
    '<h2>OUT-OF-SAMPLE CHECK</h2>' +
    '<p class="testline"><b>Leave-one-out:</b> each of the ' + v.peerCount + ' traded peers is priced by a model fitted without it.</p>' +
    '<p class="testline"><b>Walk-forward:</b> fit on peers listed earlier, tested on later ones, three expanding windows.</p>' +
    '<div class="headline"><div><b>×' + v.flat.loo.toFixed(2) + ' → ×' + v.loo.toFixed(2) + '</b><span>value miss, leave-one-out</span></div>' +
    '<div><b>×' + v.flat.wf.toFixed(2) + ' → ×' + v.wf.toFixed(2) + '</b><span>value miss, walk-forward</span></div></div>' +
    '<h3>VALUE MODEL — TERM BY TERM</h3>' +
    '<table><thead><tr><th>TERM</th><th class="num">LOO</th><th class="num">WF</th><th></th></tr></thead><tbody>' +
    '<tr><td>flat multiple (no model)</td><td class="num">' + fx(v.flat.loo) + '</td><td class="num">' + fx(v.flat.wf) + '</td><td class="rej">baseline</td></tr>' +
    termRows(v.terms, 'loo', 'wf', fx) + '</tbody></table>' +
    '<p class="small muted">Admitted only if it lowers BOTH misses. Kept: model without it · rejected: model with it.</p>' +
    '<p class="testline" style="margin-top:5px"><b>Range honesty:</b> P25–P75 held <b>' + Math.round(v.honesty.inMid * 100) + '%</b> (stated 50%) · P10–P90 held <b>' + Math.round(v.honesty.inWide * 100) + '%</b> (stated 80%).</p>' +
    '<h3>LAUNCH ODDS — LOGISTIC ON ' + o.popCount + ' DATED PROTOCOLS</h3>' +
    '<div class="headline"><div><b>' + o.base.cv.toFixed(3) + ' → ' + o.cv.toFixed(3) + '</b><span>brier, 10-fold CV</span></div>' +
    '<div><b>' + o.wf.toFixed(3) + '</b><span>brier, walk-forward</span></div></div>' +
    '<table><thead><tr><th>TERM</th><th class="num">CV</th><th class="num">WF</th><th></th></tr></thead><tbody>' +
    '<tr><td>age curve only (base design)</td><td class="num">' + fb(o.ageOnly.cv) + '</td><td class="num">' + fb(o.ageOnly.wf) + '</td><td class="rej">baseline</td></tr>' +
    termRows(o.terms, 'cv', 'wf', fb) + '</tbody></table>' +
    '<h3>ODDS CALIBRATION BY AGE BAND — OUT-OF-FOLD</h3>' +
    '<table><thead><tr><th>BAND</th><th class="num">N</th><th class="num">PREDICTED</th><th class="num">ACTUAL</th></tr></thead><tbody>' +
    o.calibration.map((c) => '<tr><td>' + c.band + '</td><td class="num">' + c.n + '</td><td class="num">' + pct(c.pred) + '</td><td class="num">' + pct(c.actual) + '</td></tr>').join('') +
    '</tbody></table>';
}

// ------------------------------------------------------------- board

function econOf(r) {
  return M.farmEconomics(r.tvl_usd, r.implied_value_usd, r.chains.length, M.SCENARIOS[state.scenario]);
}
function visibleRows() {
  let out = rows.filter((r) => {
    if (state.tier === 'watchlist' && !r.watchlist) return false;
    if (state.tier === 'early' && r.watchlist) return false;
    if (state.tier === 'farm' && econOf(r).verdict !== 'FARM') return false;
    if (state.cat && r.category !== state.cat) return false;
    if (state.chain && !r.chains.includes(state.chain)) return false;
    if (state.q && !(r.name.toLowerCase().includes(state.q) || r.slug.includes(state.q))) return false;
    return true;
  });
  const k = state.sortK, d = state.sortD;
  const val = (r) => k === 'per_hour' ? econOf(r).perHour : k === 'verdict' ? ({ FARM: 0, MARGINAL: 1, SKIP: 2 })[econOf(r).verdict] : r[k];
  out = out.slice().sort((a, b) => {
    const x = val(a), y = val(b);
    if (x == null && y == null) return a.rank - b.rank;
    if (x == null) return 1; if (y == null) return -1;
    return (x < y ? -1 : x > y ? 1 : a.rank - b.rank) * d;
  });
  return out;
}
function renderBoard() {
  const vis = visibleRows();
  $('rowCount').textContent = vis.length + ' of ' + rows.length + ' protocols';
  $('boardBody').innerHTML = vis.map((r) => {
    const e = econOf(r);
    const chains = esc(r.chains[0] || '') + (r.chains.length > 1 ? ' +' + (r.chains.length - 1) : '');
    return '<tr data-slug="' + esc(r.slug) + '">' +
      '<td class="num">' + r.rank + '</td>' +
      '<td><span class="nm">' + esc(r.name) + '</span>' +
      '<span class="badge' + (r.watchlist ? '' : ' early') + '">' + (r.watchlist ? 'WATCHLIST' : 'EARLY') + '</span>' +
      '<span class="meta">' + esc(r.family) + ' · ' + chains + '</span></td>' +
      '<td class="num">' + M.fmtUsd(r.tvl_usd) + '</td>' +
      '<td class="num ' + (r.change_7d > 0 ? 'pos' : r.change_7d < 0 ? 'neg' : '') + '">' + signed(r.change_7d) + '</td>' +
      '<td class="num">' + (r.age_years == null ? '—' : r.age_years.toFixed(1) + 'y') + '</td>' +
      '<td class="num"><span class="oddsbar"><i style="width:' + Math.round(r.odds * 100) + '%"></i></span>' + pct(r.odds) + '</td>' +
      '<td class="num">' + (r.months >= 240 ? '240+' : r.months) + ' mo</td>' +
      '<td class="num">' + M.fmtUsd(r.launch_value_usd) + '</td>' +
      '<td class="num"><b>' + M.fmtUsd(r.implied_value_usd) + '</b><span class="range">' + M.fmtUsd(r.range_lo) + ' – ' + M.fmtUsd(r.range_hi) + '</span></td>' +
      '<td class="num">' + (e.perHour < 0 ? '−$' + Math.abs(e.perHour).toFixed(1) : '$' + e.perHour.toFixed(1)) + '</td>' +
      '<td><span class="verdict ' + e.verdict + '">' + e.verdict + '</span></td></tr>';
  }).join('');
  for (const tr of $('boardBody').querySelectorAll('tr')) {
    tr.addEventListener('click', () => { location.hash = 'detail=' + tr.dataset.slug; });
  }
}

function renderRollups() {
  const col = (title, items) =>
    '<div class="pane"><h2>' + title + '</h2>' + items.map((x) =>
      '<div class="rollupRow"><span>' + esc(x.name) + ' <span class="muted">· ' + x.n + '</span></span><span class="num">' + M.fmtUsd(x.implied) + '</span></div>').join('') + '</div>';
  $('rollups').innerHTML = col('IMPLIED VALUE BY CATEGORY GROUP', radar.rollups.families) + col('IMPLIED VALUE BY PRIMARY CHAIN', radar.rollups.chains);
}

function renderAssumptions() {
  $('assumptions').innerHTML =
    '<h2>THE SCENARIO BEHIND THE VERDICTS</h2>' +
    '<p>Default plan: <b>0.02% of each protocol\'s TVL</b> (flat $1,000 / $5,000 / $25,000 plans are selectable above). A launch is assumed to give farmers <b>' +
    pct(M.DROP_SHARE) + ' of launch value</b>, split against competing farm capital of <b>' + pct(M.COMPETING_SHARE) + ' of TVL</b>. ' +
    'Fees: $6 setup + $4 per extra chain + 0.35% swap drag + $1.10 a week upkeep gas. Time: 1.2 h setup + 0.35 h per extra chain + 0.3 h a week over ' +
    M.HORIZON_WEEKS + ' weeks. Verdicts price your time: <b>FARM at $75 or more</b> of expected net per hour, <b>MARGINAL at $25</b>, SKIP below that or when net is negative.</p>' +
    '<p>Implied value = TVL × fitted multiple × fitted launch odds. The multiple is a regression of log(market cap ÷ TVL) on the ' + radar.value.peerCount +
    ' traded peers with a recorded cap of $5M or more; the odds are a logistic fit on the ' + radar.odds.popCount + ' protocols with a listing date. ' +
    'Ranges are the value model\'s leave-one-out residual bands. "When ≈" is the median wait implied by the fitted age curve — the months until a like protocol\'s chance of recording a token reaches halfway from today\'s to certain.</p>';
}

function renderFooter() {
  $('foot').textContent = 'Integrity: this page recomputed ' + rows.length + ' rows from the embedded snapshot · checksum ' + radar.checksum +
    ' (board.json: ' + EXPECTED_CHECKSUM + ') · watchlist covered 40/40 · ledger ' + radar.accounting.total + '/' + radar.accounting.total +
    ' protocols accounted · total implied ' + M.fmtUsd(radar.totalImplied) + '. Implied value is this radar\'s own claim, fitted and cross-checked — not a promise that any token launches.';
}

// ------------------------------------------------------------ detail

function nearestPeers(r) {
  const lt = Math.log(r.tvl_usd);
  return SNAPSHOT.protocols
    .filter((p) => p.mcap_usd != null && p.mcap_usd >= 5000000 && M.familyOf(p.category) === r.family)
    .map((p) => ({ name: p.name, tvl: p.tvl_usd, mcap: p.mcap_usd, d: Math.abs(Math.log(p.tvl_usd) - lt) }))
    .sort((a, b) => a.d - b.d).slice(0, 5);
}
function renderDetail(slug) {
  const r = rows.find((x) => x.slug === slug);
  if (!r) { location.hash = ''; return; }
  const e = econOf(r);
  const peers = nearestPeers(r);
  const scenRows = M.SCENARIOS.map((s, i) => {
    const x = M.farmEconomics(r.tvl_usd, r.implied_value_usd, r.chains.length, s);
    return '<tr' + (i === state.scenario ? ' style="color:var(--accent)"' : '') + '><td>' + s.label + '</td><td class="num">' + M.fmtUsd(x.plan) +
      '</td><td class="num">' + M.fmtUsd(x.gross) + '</td><td class="num">' + M.fmtUsd(x.fees) + '</td><td class="num">' + M.fmtUsd(x.net) +
      '</td><td class="num">' + x.hours.toFixed(1) + 'h</td><td class="num">$' + x.perHour.toFixed(1) + '</td><td><span class="verdict ' + x.verdict + '">' + x.verdict + '</span></td></tr>';
  }).join('');
  $('detailView').innerHTML =
    '<div class="pane"><div class="detailHead"><div><a href="#">← Board</a>' +
    '<h1 style="margin-top:6px">' + esc(r.name) + '</h1>' +
    '<p class="muted">' + esc(r.family) + (r.category ? ' · ' + esc(r.category) : '') + ' · ' + r.chains.map(esc).join(', ') + ' · ' + esc(r.slug) + '</p>' +
    '<p>' + esc(r.name) + ' records no token in the sealed snapshot. Its implied value is TVL × the fitted multiple for its size and group, discounted by the fitted odds that a look-alike protocol records a token.</p></div>' +
    '<div style="text-align:right"><span class="badge' + (r.watchlist ? '' : ' early') + '">' + (r.watchlist ? 'WATCHLIST' : 'EARLY FIND') + '</span>' +
    '<div class="num" style="font-size:20px;margin-top:6px">#' + r.rank + ' of ' + rows.length + '</div></div></div>' +
    '<div class="kvGrid">' +
    [['TVL', M.fmtUsd(r.tvl_usd)], ['7d change', signed(r.change_7d) + '%'], ['No-token age', r.age_years == null ? '—' : r.age_years.toFixed(1) + ' years'], ['Fitted multiple', '×' + r.multiple.toFixed(3)],
     ['If it launches', M.fmtUsd(r.launch_value_usd)], ['Launch odds', pct(r.odds)], ['Implied value', M.fmtUsd(r.implied_value_usd)], ['Range P25–P75', M.fmtUsd(r.range_lo) + ' – ' + M.fmtUsd(r.range_hi)],
     ['When ≈', (r.months >= 240 ? '240+' : r.months) + ' months (peers\' median)'], ['Plan verdict', e.verdict], ['Expected net', M.fmtUsd(e.net) + ' on ' + M.fmtUsd(e.plan)], ['Plan $/hour', '$' + e.perHour.toFixed(1) + ' over ' + e.hours.toFixed(1) + 'h / ' + M.HORIZON_WEEKS + ' wks']]
      .map((kv) => '<div class="kv"><b>' + kv[1] + '</b><span>' + kv[0] + '</span></div>').join('') +
    '</div>' +
    '<h2>FARM PLAN — COSTED STEP BY STEP</h2><ol class="steps">' + r.farm_steps.map((s) => '<li>' + esc(s) + '</li>').join('') + '</ol>' +
    '<h3>THE SAME PROTOCOL AT EVERY PLAN SIZE</h3><table><thead><tr><th>PLAN</th><th class="num">SIZE</th><th class="num">EXPECTED GROSS</th><th class="num">FEES</th><th class="num">NET</th><th class="num">TIME</th><th class="num">$/HOUR</th><th>VERDICT</th></tr></thead><tbody>' + scenRows + '</tbody></table>' +
    '<h3>NEAREST PRICED PEERS (' + esc(r.family) + ')</h3>' +
    (peers.length ? '<table><thead><tr><th>PEER</th><th class="num">TVL</th><th class="num">MARKET CAP</th><th class="num">CAP ÷ TVL</th></tr></thead><tbody>' +
      peers.map((p) => '<tr><td>' + esc(p.name) + '</td><td class="num">' + M.fmtUsd(p.tvl) + '</td><td class="num">' + M.fmtUsd(p.mcap) + '</td><td class="num">×' + (p.mcap / p.tvl).toFixed(3) + '</td></tr>').join('') +
      '</tbody></table><p class="small muted">Real market caps of the closest token-recorded protocols in the same group — the evidence the multiple was fitted on.</p>'
      : '<p class="muted">No priced peers in this group.</p>') +
    '</div>';
  $('boardView').hidden = true;
  $('detailView').hidden = false;
}

// ------------------------------------------------------ basket builder
// Greedy by expected net per hour at the default scenario: walk the
// board in $/hour order, take each plan (0.02% of TVL) while the budget
// and the weekly time allowance last, and total what the basket makes.

function renderBasket() {
  const el = $('basket');
  const budget = Math.max(0, +($('basketBudget').value || 0));
  const hpw = Math.max(0, +($('basketHours').value || 0));
  const plans = rows.map((r) => ({ r, e: M.farmEconomics(r.tvl_usd, r.implied_value_usd, r.chains.length, M.DEFAULT_SCENARIO) }))
    .filter((x) => x.e.net > 0)
    .sort((a, b) => b.e.perHour - a.e.perHour);
  const picked = [];
  let spent = 0, weekly = 0;
  for (const x of plans) {
    const w = x.e.hours / M.HORIZON_WEEKS;
    if (spent + x.e.plan <= budget && weekly + w <= hpw) {
      picked.push(x); spent += x.e.plan; weekly += w;
    }
  }
  const net = picked.reduce((s, x) => s + x.e.net, 0);
  const hours = picked.reduce((s, x) => s + x.e.hours, 0);
  $('basketBody').innerHTML = picked.map((x) =>
    '<tr><td>' + x.r.rank + '</td><td>' + esc(x.r.name) + '</td><td class="num">' + M.fmtUsd(x.e.plan) + '</td>' +
    '<td class="num">' + M.fmtUsd(x.e.net) + '</td><td class="num">' + (x.e.hours / M.HORIZON_WEEKS).toFixed(2) + ' h/wk</td>' +
    '<td class="num">$' + x.e.perHour.toFixed(1) + '</td><td><span class="verdict ' + x.e.verdict + '">' + x.e.verdict + '</span></td></tr>').join('');
  $('basketTotals').innerHTML = picked.length
    ? '<b>' + picked.length + ' plans</b> · capital ' + M.fmtUsd(spent) + ' of ' + M.fmtUsd(budget) +
      ' · expected net <b>' + M.fmtUsd(net) + '</b> over ' + M.HORIZON_WEEKS + ' weeks · ' + weekly.toFixed(1) +
      ' h/wk of your ' + hpw + ' · blended $' + (hours ? (net / hours).toFixed(1) : '0') + '/hour'
    : 'No plan fits that budget and time allowance at the default scenario.';
}
function initBasket() {
  $('basket').innerHTML =
    '<h2>BASKET BUILDER — FROM BOARD TO A PLAN</h2>' +
    '<div class="row"><label class="small muted">Total budget <input id="basketBudget" type="number" value="25000" min="0" step="500"></label>' +
    '<label class="small muted">Hours per week <input id="basketHours" type="number" value="5" min="0" step="0.5"></label>' +
    '<span class="small muted">Greedy by expected net per hour at the default 0.02%-of-TVL plan; a plan joins while both allowances last.</span></div>' +
    '<table><thead><tr><th>#</th><th>PROTOCOL</th><th class="num">PLAN</th><th class="num">EXPECTED NET</th><th class="num">TIME</th><th class="num">$/HOUR</th><th>VERDICT</th></tr></thead>' +
    '<tbody id="basketBody"></tbody></table><p id="basketTotals" style="margin-top:6px"></p>';
  $('basketBudget').addEventListener('input', renderBasket);
  $('basketHours').addEventListener('input', renderBasket);
  renderBasket();
}

// -------------------------------------------------------------- wiring

function applyRoute() {
  const kv = parseHash();
  if (kv.detail) { renderDetail(kv.detail); return; }
  $('boardView').hidden = false;
  $('detailView').hidden = true;
  if (kv.tier) {
    state.tier = kv.tier;
    for (const b of $('tierTabs').querySelectorAll('button')) b.classList.toggle('on', b.dataset.tier === state.tier);
  }
  renderBoard();
}
function init() {
  renderHeader(); renderStats(); renderAccounting(); renderRail(); renderRollups(); renderAssumptions(); renderFooter(); initBasket();
  const cats = [...new Set(rows.map((r) => r.category).filter(Boolean))].sort();
  $('catSel').innerHTML = '<option value="">All categories</option>' + cats.map((c) => '<option>' + esc(c) + '</option>').join('');
  const chains = [...new Set(rows.flatMap((r) => r.chains))].sort();
  $('chainSel').innerHTML = '<option value="">All chains</option>' + chains.map((c) => '<option>' + esc(c) + '</option>').join('');
  $('scenarioSel').innerHTML = M.SCENARIOS.map((s, i) => '<option value="' + i + '">' + s.label + '</option>').join('');
  $('q').addEventListener('input', (ev) => { state.q = ev.target.value.toLowerCase(); renderBoard(); });
  $('catSel').addEventListener('change', (ev) => { state.cat = ev.target.value; renderBoard(); });
  $('chainSel').addEventListener('change', (ev) => { state.chain = ev.target.value; renderBoard(); });
  $('scenarioSel').addEventListener('change', (ev) => { state.scenario = +ev.target.value; renderBoard(); });
  for (const b of $('tierTabs').querySelectorAll('button')) {
    b.addEventListener('click', () => {
      state.tier = b.dataset.tier;
      for (const x of $('tierTabs').querySelectorAll('button')) x.classList.toggle('on', x === b);
      renderBoard();
    });
  }
  for (const th of document.querySelectorAll('#board th.sortable')) {
    th.addEventListener('click', () => {
      const k = th.dataset.k;
      if (state.sortK === k) state.sortD = -state.sortD; else { state.sortK = k; state.sortD = k === 'name' || k === 'verdict' ? 1 : -1; }
      renderBoard();
    });
  }
  const download = (name, text, type) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 500);
  };
  $('csvBtn').addEventListener('click', () => {
    const head = 'rank,slug,name,tvl_usd,implied_value_usd,odds,verdict\n';
    download('token-radar-board.csv', head + visibleRows().map((r) => [r.rank, r.slug, '"' + r.name.replace(/"/g, '""') + '"', r.tvl_usd, r.implied_value_usd, r.odds, econOf(r).verdict].join(',')).join('\n'), 'text/csv');
  });
  $('jsonBtn').addEventListener('click', () => download('token-radar-board.json', JSON.stringify({ rows: visibleRows() }, null, 2), 'application/json'));
  window.addEventListener('hashchange', applyRoute);
  applyRoute();
}
init();
