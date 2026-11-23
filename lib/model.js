// Token Radar model: one deterministic implementation, run by main.ts in
// Node and by the dashboard in the browser, so the page's board is the
// program's board recomputed, never a second copy that could drift.
//
// Everything here is hand-rolled: least squares by normal equations,
// logistic regression by IRLS, greedy term admission judged only on
// held-out data. No randomness, no clock, no network.

export const DROP_SHARE = 0.05;        // share of launch value a launch gives farmers
export const COMPETING_SHARE = 0.08;   // other farm capital, as a share of TVL
export const HORIZON_WEEKS = 26;       // farm horizon behind every verdict
export const DEFAULT_SCENARIO = { kind: 'tvl', share: 0.0002, label: '0.02% of TVL' };
export const SCENARIOS = [
  { kind: 'tvl', share: 0.0002, label: '0.02% of TVL' },
  { kind: 'flat', usd: 1000, label: '$1,000 flat' },
  { kind: 'flat', usd: 5000, label: '$5,000 flat' },
  { kind: 'flat', usd: 25000, label: '$25,000 flat' },
];

const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

export function recordsToken(p) {
  return p.gecko_id != null || p.symbol != null;
}

// Which accounting group a protocol falls in. The order is the rule's
// order: a bridged product of a traded token is a bridge product first.
export function classify(p) {
  if (recordsToken(p)) return 'token';
  const c = p.category || '';
  if (c === 'Bridge' || c === 'Canonical Bridge' || c === 'Cross Chain Bridge') return 'bridge';
  if (c === 'Liquid Staking' || c === 'Liquid Restaking' || c === 'Restaked BTC') return 'liquid staking/restaking';
  if (c === 'CEX' || EXCHANGE_PREFIXES.some((e) => p.name.startsWith(e))) return 'exchange products';
  if (VERSIONED.test(p.name)) return 'versioned';
  if (WRAPPED_WORD.test(p.name)) return 'wrapped/staked by name';
  return 'eligible';
}

const FAMILY_MAP = {
  'Dexs': 'DEX',
  'Lending': 'Lending & CDP', 'CDP': 'Lending & CDP', 'CDP Manager': 'Lending & CDP',
  'Uncollateralized Lending': 'Lending & CDP', 'Collateral Markets': 'Lending & CDP',
  'Collateral Management': 'Lending & CDP',
  'Liquid Staking': 'Staking', 'Liquid Restaking': 'Staking', 'Restaking': 'Staking',
  'Staking Pool': 'Staking', 'Restaked BTC': 'Staking', 'Anchor BTC': 'Staking',
  'Decentralized BTC': 'Staking',
  'Bridge': 'Bridge', 'Canonical Bridge': 'Bridge', 'Cross Chain Bridge': 'Bridge',
  'Yield': 'Yield', 'Yield Aggregator': 'Yield', 'Leveraged Farming': 'Yield',
  'Farm': 'Yield', 'Liquidity Manager': 'Yield',
  'Derivatives': 'Derivatives', 'Options': 'Derivatives', 'Options Vault': 'Derivatives',
  'Synthetics': 'Derivatives', 'Interest Rate Derivatives': 'Derivatives',
  'RWA': 'RWA', 'CEX': 'Exchange', 'CeDeFi': 'Exchange',
  'Risk Curators': 'Curators & Allocators', 'Onchain Capital Allocator': 'Curators & Allocators',
  'Chain': 'Chain',
};
export function familyOf(category) {
  return FAMILY_MAP[category || ''] || 'Other';
}

// ------------------------------------------------------------ small math

function median(xs) {
  const a = xs.slice().sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
function quantile(xs, q) {
  const a = xs.slice().sort((x, y) => x - y);
  const i = Math.min(a.length - 1, Math.max(0, Math.floor(q * a.length)));
  return a[i];
}
function solve(A, b) {
  // Gaussian elimination with partial pivoting; A is n x n, b length n.
  const n = b.length;
  const M = A.map((row, i) => row.concat(b[i]));
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    const tmp = M[col]; M[col] = M[piv]; M[piv] = tmp;
    const d = M[col][col] || 1e-12;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / d;
      if (f === 0) continue;
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row, i) => row[n] / (row[i] || 1e-12));
}
function ols(X, y, ridge) {
  const p = X[0].length;
  const A = Array.from({ length: p }, () => new Array(p).fill(0));
  const b = new Array(p).fill(0);
  for (let i = 0; i < X.length; i++) {
    for (let a = 0; a < p; a++) {
      b[a] += X[i][a] * y[i];
      for (let c = 0; c < p; c++) A[a][c] += X[i][a] * X[i][c];
    }
  }
  for (let a = 0; a < p; a++) A[a][a] += ridge;
  return solve(A, b);
}
function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}
export function checksumOf(rows) {
  const s = rows.map((r) => r.slug + ':' + r.rank + ':' + r.implied_value_usd).join('|');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return ('0000000' + h.toString(16)).slice(-8);
}
export function fmtUsd(v) {
  if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
  if (v >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'k';
  return '$' + Math.round(v);
}

// ------------------------------------------------------- protocol shape

function dayMs(iso) {
  return Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
}
export function enrich(p, asOfMs) {
  const ageY = p.listed_at ? (asOfMs - dayMs(p.listed_at)) / (365.25 * 86400000) : null;
  return {
    slug: p.slug, name: p.name, category: p.category, chains: p.chains,
    tvl: p.tvl_usd, change7d: p.change_7d, mcap: p.mcap_usd,
    token: recordsToken(p), group: classify(p), family: familyOf(p.category),
    logT: Math.log(p.tvl_usd), ageY,
    growth: p.change_7d == null ? 0 : Math.min(300, Math.max(-50, p.change_7d)) / 100,
    lnChains: Math.log(Math.max(1, p.chains.length)),
  };
}

// ---------------------------------------------------------- value model
// Peers: protocols whose token already trades with a recorded market cap.
// The model prices log(mcap / TVL). A term block is admitted only when it
// lowers BOTH the leave-one-out miss and the walk-forward miss.

const VALUE_BLOCKS = [
  { id: 'quad', label: 'size curve, squared' },
  { id: 'cubic', label: 'size curve, cubed' },
  { id: 'family', label: 'category group effects (shrunk)' },
  { id: 'chains', label: 'chain count' },
  { id: 'growth', label: '7-day growth, clipped' },
  { id: 'age', label: 'age since listing' },
  { id: 'agebuckets', label: 'age buckets' },
  { id: 'intTG', label: 'size x growth' },
  { id: 'intTA', label: 'size x age' },
];

function valueFeatures(q, blocks, center) {
  const z = q.logT - center;
  const la = Math.log(1 + q.ageImp);
  const x = [1, z];
  for (const b of blocks) {
    if (b === 'quad') x.push(z * z);
    else if (b === 'cubic') x.push(z * z * z);
    else if (b === 'chains') x.push(q.lnChains);
    else if (b === 'growth') x.push(q.growth);
    else if (b === 'age') x.push(la);
    else if (b === 'agebuckets') x.push(q.ageImp < 1 ? 1 : 0, q.ageImp >= 1 && q.ageImp < 2 ? 1 : 0, q.ageImp >= 2 && q.ageImp < 4 ? 1 : 0);
    else if (b === 'intTG') x.push(z * q.growth);
    else if (b === 'intTA') x.push(z * la);
  }
  return x;
}

function fitValue(train, blocks) {
  const center = train.reduce((s, q) => s + q.logT, 0) / train.length;
  const X = train.map((q) => valueFeatures(q, blocks, center));
  const y = train.map((q) => Math.log(q.mcap / q.tvl));
  const beta = ols(X, y, 1e-6);
  let offsets = null;
  if (blocks.includes('family')) {
    const sums = {}, counts = {};
    train.forEach((q, i) => {
      const r = y[i] - dot(X[i], beta);
      sums[q.family] = (sums[q.family] || 0) + r;
      counts[q.family] = (counts[q.family] || 0) + 1;
    });
    offsets = {};
    for (const f of Object.keys(sums)) offsets[f] = (counts[f] / (counts[f] + 6)) * (sums[f] / counts[f]);
  }
  return { center, beta, blocks, offsets };
}
function predictValue(fit, q) {
  let v = dot(valueFeatures(q, fit.blocks, fit.center), fit.beta);
  if (fit.offsets) v += fit.offsets[q.family] || 0;
  return v; // log(mcap / TVL)
}
function missFactor(pairs) {
  // pairs: [logPred, logActual] of market caps
  let s = 0;
  for (const [a, b] of pairs) s += Math.abs(a - b);
  return Math.exp(s / pairs.length);
}
function valueLoo(peers, blocks) {
  const pairs = [];
  for (let i = 0; i < peers.length; i++) {
    const fit = fitValue(peers.filter((_, j) => j !== i), blocks);
    pairs.push([Math.log(peers[i].tvl) + predictValue(fit, peers[i]), Math.log(peers[i].mcap)]);
  }
  return missFactor(pairs);
}
// Walk-forward, expanding window: fit on the peers listed earliest,
// test on the next block, widen, repeat. Three origins (40/60/80%)
// pooled, so one lucky split cannot admit or kill a term on its own.
function wfBlocks(sorted) {
  const n = sorted.length;
  const cuts = [Math.floor(n * 0.4), Math.floor(n * 0.6), Math.floor(n * 0.8)];
  const out = [];
  for (let i = 0; i < cuts.length; i++) {
    const train = sorted.slice(0, cuts[i]);
    const test = sorted.slice(cuts[i], i + 1 < cuts.length ? cuts[i + 1] : n);
    if (train.length && test.length) out.push([train, test]);
  }
  return out;
}
function byListing(a, b) {
  return (a.listedKey - b.listedKey) || (a.slug < b.slug ? -1 : 1);
}
function valueWf(datedPeers, blocks) {
  const pairs = [];
  for (const [train, test] of wfBlocks(datedPeers.slice().sort(byListing))) {
    const fit = fitValue(train, blocks);
    for (const q of test) pairs.push([Math.log(q.tvl) + predictValue(fit, q), Math.log(q.mcap)]);
  }
  return missFactor(pairs);
}
function flatMiss(peers, datedPeers) {
  const looPairs = peers.map((q, i) => {
    const rest = peers.filter((_, j) => j !== i).map((r) => r.mcap / r.tvl);
    return [Math.log(q.tvl * median(rest)), Math.log(q.mcap)];
  });
  const wfPairs = [];
  for (const [train, test] of wfBlocks(datedPeers.slice().sort(byListing))) {
    const m = median(train.map((r) => r.mcap / r.tvl));
    for (const q of test) wfPairs.push([Math.log(q.tvl * m), Math.log(q.mcap)]);
  }
  return { loo: missFactor(looPairs), wf: missFactor(wfPairs) };
}

function buildValueModel(peers, datedPeers) {
  const flat = flatMiss(peers, datedPeers);
  let blocks = [];
  let cur = { loo: valueLoo(peers, blocks), wf: valueWf(datedPeers, blocks) };
  const rounds = [];
  for (;;) {
    let best = null;
    for (const cand of VALUE_BLOCKS) {
      if (blocks.includes(cand.id)) continue;
      const trial = blocks.concat(cand.id);
      const loo = valueLoo(peers, trial);
      const wf = valueWf(datedPeers, trial);
      rounds.push({ id: cand.id, against: blocks.slice(), loo, wf });
      if (loo < cur.loo * 0.999 && wf < cur.wf * 0.999) {
        const score = (loo + wf) / 2;
        if (!best || score < best.score) best = { id: cand.id, loo, wf, score };
      }
    }
    if (!best) break;
    blocks.push(best.id);
    cur = { loo: best.loo, wf: best.wf };
  }
  // Ablation table: each block against the final model (removed if kept,
  // added if not), so the printed numbers are one consistent comparison.
  const terms = VALUE_BLOCKS.map((b) => {
    const kept = blocks.includes(b.id);
    const trial = kept ? blocks.filter((x) => x !== b.id) : blocks.concat(b.id);
    return {
      id: b.id, label: b.label, kept,
      loo: valueLoo(peers, trial), wf: valueWf(datedPeers, trial),
    };
  });
  const fit = fitValue(peers, blocks);
  // LOO residuals of the final model set the printed ranges, and the
  // honesty lines measure how often real caps landed inside them.
  const resid = [];
  for (let i = 0; i < peers.length; i++) {
    const f = fitValue(peers.filter((_, j) => j !== i), blocks);
    resid.push(Math.log(peers[i].mcap) - (Math.log(peers[i].tvl) + predictValue(f, peers[i])));
  }
  const qs = {
    q10: quantile(resid, 0.10), q25: quantile(resid, 0.25),
    q75: quantile(resid, 0.75), q90: quantile(resid, 0.90),
  };
  const inMid = resid.filter((r) => r >= qs.q25 && r <= qs.q75).length / resid.length;
  const inWide = resid.filter((r) => r >= qs.q10 && r <= qs.q90).length / resid.length;
  return {
    blocks, terms, flat, loo: cur.loo, wf: cur.wf, fit, qs,
    honesty: { inMid, inWide }, peerCount: peers.length, datedCount: datedPeers.length,
  };
}

// ----------------------------------------------------------- odds model
// Population: every protocol with a listing date. The outcome is whether
// it records a token today. Logistic regression by IRLS; a term block is
// admitted only when it lowers BOTH the ten-fold cross-validated Brier
// score and the walk-forward Brier score.

const ODDS_BLOCKS = [
  { id: 'logT', label: 'log TVL' },
  { id: 'logT2', label: 'log TVL, squared' },
  { id: 'age2', label: 'age, squared' },
  { id: 'agebuckets', label: 'age buckets' },
  { id: 'growth', label: '7-day growth, clipped' },
  { id: 'chains', label: 'chain count' },
  { id: 'intAT', label: 'age x size' },
  { id: 'family', label: 'category group effects (shrunk)' },
];

function oddsFeatures(q, blocks, center) {
  const z = q.logT - center;
  const x = [1, q.ageY];
  for (const b of blocks) {
    if (b === 'logT') x.push(z);
    else if (b === 'logT2') x.push(z * z);
    else if (b === 'age2') x.push((q.ageY * q.ageY) / 10);
    else if (b === 'agebuckets') x.push(q.ageY < 1 ? 1 : 0, q.ageY >= 1 && q.ageY < 2 ? 1 : 0, q.ageY >= 2 && q.ageY < 4 ? 1 : 0);
    else if (b === 'growth') x.push(q.growth);
    else if (b === 'chains') x.push(q.lnChains);
    else if (b === 'intAT') x.push((z * q.ageY) / 5);
  }
  return x;
}
function fitLogistic(train, blocks) {
  const center = train.reduce((s, q) => s + q.logT, 0) / train.length;
  const X = train.map((q) => oddsFeatures(q, blocks, center));
  const y = train.map((q) => (q.token ? 1 : 0));
  const p = X[0].length;
  let beta = new Array(p).fill(0);
  beta[0] = Math.log((y.reduce((s, v) => s + v, 0) + 0.5) / (train.length - y.reduce((s, v) => s + v, 0) + 0.5));
  for (let iter = 0; iter < 30; iter++) {
    const A = Array.from({ length: p }, () => new Array(p).fill(0));
    const b = new Array(p).fill(0);
    for (let i = 0; i < X.length; i++) {
      const eta = dot(X[i], beta);
      const mu = 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, eta))));
      const w = Math.max(1e-6, mu * (1 - mu));
      const z = eta + (y[i] - mu) / w;
      for (let a = 0; a < p; a++) {
        b[a] += X[i][a] * w * z;
        for (let c = 0; c < p; c++) A[a][c] += X[i][a] * w * X[i][c];
      }
    }
    for (let a = 1; a < p; a++) A[a][a] += 1.0;
    beta = solve(A, b);
  }
  let offsets = null;
  if (blocks.includes('family')) {
    const sums = {}, counts = {};
    train.forEach((q, i) => {
      const eta = dot(X[i], beta);
      const mu = 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, eta))));
      const r = (y[i] - mu) / Math.max(0.04, mu * (1 - mu));
      sums[q.family] = (sums[q.family] || 0) + r;
      counts[q.family] = (counts[q.family] || 0) + 1;
    });
    offsets = {};
    for (const f of Object.keys(sums)) {
      const raw = (counts[f] / (counts[f] + 10)) * (sums[f] / counts[f]);
      offsets[f] = Math.max(-1.5, Math.min(1.5, raw));
    }
  }
  return { center, beta, blocks, offsets };
}
function predictOdds(fit, q) {
  let eta = dot(oddsFeatures(q, fit.blocks, fit.center), fit.beta);
  if (fit.offsets) eta += fit.offsets[q.family] || 0;
  return 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, eta))));
}
function brier(pairs) {
  let s = 0;
  for (const [p, y] of pairs) s += (p - y) * (p - y);
  return s / pairs.length;
}
function oddsCv(pop, blocks) {
  const pairs = new Array(pop.length);
  for (let fold = 0; fold < 10; fold++) {
    const train = pop.filter((_, i) => i % 10 !== fold);
    const fit = fitLogistic(train, blocks);
    pop.forEach((q, i) => { if (i % 10 === fold) pairs[i] = [predictOdds(fit, q), q.token ? 1 : 0]; });
  }
  return { brier: brier(pairs), pairs };
}
function oddsWf(pop, blocks) {
  const pairs = [];
  for (const [train, test] of wfBlocks(pop.slice().sort(byListing))) {
    const fit = fitLogistic(train, blocks);
    for (const q of test) pairs.push([predictOdds(fit, q), q.token ? 1 : 0]);
  }
  return brier(pairs);
}
function baseRateBrier(pop) {
  const cvPairs = [];
  for (let fold = 0; fold < 10; fold++) {
    const train = pop.filter((_, i) => i % 10 !== fold);
    const rate = train.reduce((s, q) => s + (q.token ? 1 : 0), 0) / train.length;
    pop.forEach((q, i) => { if (i % 10 === fold) cvPairs.push([rate, q.token ? 1 : 0]); });
  }
  const wfPairs = [];
  for (const [train, test] of wfBlocks(pop.slice().sort(byListing))) {
    const rate = train.reduce((s, q) => s + (q.token ? 1 : 0), 0) / train.length;
    for (const q of test) wfPairs.push([rate, q.token ? 1 : 0]);
  }
  return { cv: brier(cvPairs), wf: brier(wfPairs) };
}

function buildOddsModel(pop) {
  const base = baseRateBrier(pop);
  const ageOnly = { cv: oddsCv(pop, []).brier, wf: oddsWf(pop, []) };
  let blocks = [];
  let cur = (() => { const c = oddsCv(pop, blocks); return { cv: c.brier, wf: oddsWf(pop, blocks) }; })();
  for (;;) {
    let best = null;
    for (const cand of ODDS_BLOCKS) {
      if (blocks.includes(cand.id)) continue;
      const trial = blocks.concat(cand.id);
      const cv = oddsCv(pop, trial).brier;
      const wf = oddsWf(pop, trial);
      if (cv < cur.cv * 0.999 && wf < cur.wf * 0.999) {
        const score = (cv + wf) / 2;
        if (!best || score < best.score) best = { id: cand.id, cv, wf, score };
      }
    }
    if (!best) break;
    blocks.push(best.id);
    cur = { cv: best.cv, wf: best.wf };
  }
  const terms = ODDS_BLOCKS.map((b) => {
    const kept = blocks.includes(b.id);
    const trial = kept ? blocks.filter((x) => x !== b.id) : blocks.concat(b.id);
    return { id: b.id, label: b.label, kept, cv: oddsCv(pop, trial).brier, wf: oddsWf(pop, trial) };
  });
  const fit = fitLogistic(pop, blocks);
  const oof = oddsCv(pop, blocks).pairs;
  const bands = [
    ['<0.5y', 0, 0.5], ['0.5-1y', 0.5, 1], ['1-2y', 1, 2],
    ['2-3y', 2, 3], ['3-5y', 3, 5], ['5y+', 5, 1e9],
  ];
  const popSorted = pop.slice();
  const calibration = bands.map(([label, lo, hi]) => {
    let n = 0, ps = 0, ys = 0;
    popSorted.forEach((q, i) => {
      if (q.ageY >= lo && q.ageY < hi) { n++; ps += oof[i][0]; ys += oof[i][1]; }
    });
    return { band: label, n, pred: n ? ps / n : 0, actual: n ? ys / n : 0 };
  }).filter((r) => r.n > 0);
  return { blocks, terms, base, ageOnly, cv: cur.cv, wf: cur.wf, fit, calibration, popCount: pop.length };
}

// Months-to-token: an age-only logistic curve F(a) = share of protocols
// that record a token by age a. A protocol's estimate is the conditional
// median wait: the months until F reaches halfway from F(its age) to 1.
function buildMonthsCurve(pop) {
  const train = pop.map((q) => ({
    ageY: q.ageY, token: q.token, logT: q.logT, growth: q.growth,
    lnChains: q.lnChains, family: q.family, slug: q.slug, listedKey: q.listedKey,
  }));
  const fit = fitLogistic(train, ['age2']);
  const F = (a) => predictOdds(fit, {
    ageY: a, logT: fit.center, growth: 0, lnChains: 0, family: '', slug: '', token: false, listedKey: 0,
  });
  return function monthsFor(ageY) {
    const f0 = F(ageY);
    const target = f0 + (1 - f0) / 2;
    for (let m = 1; m <= 240; m++) {
      if (F(ageY + m / 12) >= target) return m;
    }
    return 240;
  };
}

// ------------------------------------------------------- farm economics

export function farmEconomics(tvl, implied, chainCount, scenario) {
  const plan = scenario.kind === 'tvl' ? tvl * scenario.share : scenario.usd;
  const gross = implied * DROP_SHARE * (plan / (plan + COMPETING_SHARE * tvl));
  const fees = 6 + 4 * (chainCount - 1) + 0.0035 * plan + 1.1 * HORIZON_WEEKS;
  const hours = 1.2 + 0.35 * (chainCount - 1) + 0.3 * HORIZON_WEEKS;
  const net = gross - fees;
  const perHour = net / hours;
  // Stated verdict lines: your time is the scarce input, so a plan is
  // FARM at $75 or more of expected net per hour, MARGINAL at $25.
  const verdict = net <= 0 ? 'SKIP' : perHour >= 75 ? 'FARM' : perHour >= 25 ? 'MARGINAL' : 'SKIP';
  return { plan, gross, fees, hours, net, perHour, verdict };
}

const CORE_ACTION = {
  'DEX': (n) => `Provide liquidity to ${n}'s deepest stablecoin pair, the pool its own interface ranks first by volume`,
  'Lending & CDP': (n) => `Supply stablecoin collateral to ${n}'s main market and keep the position open, borrowing nothing against it at first`,
  'Staking': (n) => `Stake through ${n}'s canonical staking contract from this same wallet and hold the receipt token it issues`,
  'Yield': (n) => `Deposit into ${n}'s flagship vault, the one its interface lists first by TVL, and leave auto-compounding on`,
  'Derivatives': (n) => `Open a small hedged position on ${n} (long spot against a short perp of the same size) so volume accrues without directional risk`,
  'Curators & Allocators': (n) => `Allocate to the largest curated vault on ${n}, the one its interface ranks first by deposits`,
  'RWA': (n) => `Subscribe to ${n}'s shortest-duration tokenised asset vault once its onboarding check clears`,
  'Chain': (n) => `Hold the working balance on ${n} itself and pay gas there weekly, so the wallet reads as a native user of the chain`,
  'Bridge': (n) => `Route the position's transfers through ${n}'s own bridge rather than a third-party one`,
  'Exchange': (n) => `Hold the balance in ${n}'s onchain product rather than its custodial one, so the activity stays attributable`,
  'Other': (n) => `Deposit into ${n}'s core product, the one its interface presents first, and hold the position it issues`,
};

export function farmSteps(q, econ) {
  const main = q.chains[0] || 'Ethereum';
  const extra = q.chains.length > 1 ? ` (it also runs on ${q.chains.length - 1} more)` : '';
  const plan = fmtUsd(econ.plan);
  const drag = fmtUsd(0.0035 * econ.plan);
  const core = (CORE_ACTION[q.family] || CORE_ACTION.Other)(q.name);
  return [
    `Bridge ${plan} of stablecoins to ${main}, the chain holding most of ${q.name}'s TVL${extra}, through its canonical bridge; budget $12 in bridge and gas fees and about 25 minutes, and keep the arrival transaction hash.`,
    `Acquire the position asset in two clips an hour apart on ${main}'s main exchange; budget 0.35% swap drag (about ${drag}) and 30 minutes, and avoid the hour around any announced snapshot.`,
    `${core}; budget $6 in gas and about 20 minutes, and hold it in this one wallet so the activity is attributable.`,
    `Split the position: keep 80% in the core action above and put 20% into ${q.name}'s second product (another market, pool or vault it runs) so the wallet shows breadth, not a single deposit.`,
    `Run a weekly cadence for ${HORIZON_WEEKS} weeks: one interaction, claim or rebalance a week at about $1.20 in gas and 20 minutes each, so the wallet never reads as dormant before a snapshot.`,
    `Track ${q.name}'s governance forum and announcements monthly; if a token vote or points programme appears, register this same wallet first — the plan is sized at ${plan}, small enough to be early and large enough to count.`,
    `Exit discipline: if ${q.name} records no token within the ${HORIZON_WEEKS}-week horizon, unwind in two clips a week apart (about ${drag} in drag) rather than panic-selling on a rumour. At the default plan the model expects ${fmtUsd(econ.gross)} gross against ${fmtUsd(econ.fees)} of fees, about ${fmtUsd(Math.max(0, econ.net))} net over ${econ.hours.toFixed(1)} hours.`,
  ];
}

// ------------------------------------------------------------ the board

export function buildRadar(snapshot) {
  const asOfMs = dayMs(snapshot.as_of);
  const all = snapshot.protocols.map((p) => {
    const q = enrich(p, asOfMs);
    q.listedKey = p.listed_at ? dayMs(p.listed_at) : null;
    return q;
  });
  const watch = new Set(snapshot.watchlist);
  const accounting = { total: all.length, token: 0, ranked: 0, belowCut: 0 };
  for (const g of ['bridge', 'liquid staking/restaking', 'exchange products', 'versioned', 'wrapped/staked by name']) accounting[g] = 0;
  for (const q of all) {
    if (q.group === 'token') accounting.token++;
    else if (q.group !== 'eligible') accounting[q.group]++;
  }
  // Value peers: tokens that trade with a recorded market cap at or
  // above the snapshot's own $5M materiality floor. Below it, recorded
  // caps are mostly dust and sentinel values, and they bend the fit.
  const peers = all.filter((q) => q.mcap != null && q.mcap >= 5000000);
  const datedPeers = peers.filter((q) => q.ageY != null);
  const medianPeerAge = median(datedPeers.map((q) => q.ageY));
  for (const q of peers) q.ageImp = q.ageY == null ? medianPeerAge : q.ageY;
  const pop = all.filter((q) => q.ageY != null);
  const medianPopAge = median(pop.filter((q) => !q.token).map((q) => q.ageY));

  const value = buildValueModel(peers, datedPeers);
  const odds = buildOddsModel(pop);
  const monthsFor = buildMonthsCurve(pop);

  const eligible = all.filter((q) => q.group === 'eligible');
  const early = eligible.filter((q) => !watch.has(q.slug)).sort((a, b) => b.tvl - a.tvl);
  const boardSet = eligible.filter((q) => watch.has(q.slug)).concat(early.slice(0, 158));
  accounting.ranked = boardSet.length;
  accounting.belowCut = eligible.length - boardSet.length;

  const rows = boardSet.map((q) => {
    const ageUse = q.ageY == null ? medianPopAge : q.ageY;
    const qx = Object.assign({}, q, { ageImp: ageUse, ageY: ageUse });
    const multiple = Math.exp(predictValue(value.fit, qx));
    const launch = q.tvl * multiple;
    const o = predictOdds(odds.fit, qx);
    const implied = Math.max(1, Math.min(1e14, Math.round(launch * o)));
    const econ = farmEconomics(q.tvl, implied, q.chains.length, DEFAULT_SCENARIO);
    const row = {
      slug: q.slug, name: q.name, rank: 0, implied_value_usd: implied,
      farm_steps: farmSteps(q, econ),
      tvl_usd: q.tvl, category: q.category, chains: q.chains,
      change_7d: q.change7d, age_years: q.ageY == null ? null : Math.round(q.ageY * 100) / 100,
      family: q.family, watchlist: watch.has(q.slug),
      multiple: Math.round(multiple * 10000) / 10000,
      launch_value_usd: Math.round(launch),
      odds: Math.round(o * 10000) / 10000,
      range_lo: Math.round(implied * Math.exp(value.qs.q25)),
      range_hi: Math.round(implied * Math.exp(value.qs.q75)),
      months: monthsFor(qx.ageImp),
      plan_usd: Math.round(econ.plan), net_usd: Math.round(econ.net),
      per_hour: Math.round(econ.perHour * 10) / 10, verdict: econ.verdict,
    };
    return row;
  });
  rows.sort((a, b) => (b.implied_value_usd - a.implied_value_usd) || (a.slug < b.slug ? -1 : 1));
  rows.forEach((r, i) => { r.rank = i + 1; });

  const famRoll = {}, chainRoll = {};
  for (const r of rows) {
    famRoll[r.family] = famRoll[r.family] || { name: r.family, implied: 0, n: 0 };
    famRoll[r.family].implied += r.implied_value_usd; famRoll[r.family].n++;
    const c = r.chains[0] || 'Unknown';
    chainRoll[c] = chainRoll[c] || { name: c, implied: 0, n: 0 };
    chainRoll[c].implied += r.implied_value_usd; chainRoll[c].n++;
  }
  const byImplied = (a, b) => b.implied - a.implied;
  const verdicts = { FARM: 0, MARGINAL: 0, SKIP: 0 };
  for (const r of rows) verdicts[r.verdict]++;

  return {
    asOf: snapshot.as_of, source: snapshot.source, floor: snapshot.floor_usd,
    accounting, rows, checksum: checksumOf(rows),
    value: {
      blocks: value.blocks, terms: value.terms, flat: value.flat,
      loo: value.loo, wf: value.wf, honesty: value.honesty,
      peerCount: value.peerCount, datedCount: value.datedCount,
      rangeLabels: { mid: 'P25-P75', wide: 'P10-P90' },
    },
    odds: {
      blocks: odds.blocks, terms: odds.terms, base: odds.base, ageOnly: odds.ageOnly,
      cv: odds.cv, wf: odds.wf, calibration: odds.calibration, popCount: odds.popCount,
    },
    rollups: {
      families: Object.values(famRoll).sort(byImplied).slice(0, 6),
      chains: Object.values(chainRoll).sort(byImplied).slice(0, 6),
    },
    verdicts,
    totalImplied: rows.reduce((s, r) => s + r.implied_value_usd, 0),
  };
}
