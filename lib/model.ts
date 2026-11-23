// Launch Radar v2 — the value model for token-radar-01.
//
// v2 keeps v1's fitted model (OLS log-log on the snapshot's token peers,
// held-out tested twice) and closes the five gaps the v1 board left open:
//   1. coverage: the board now carries every protocol in the snapshot — all
//      758 of them — pre-token, live-token and token-recorded-but-unpriced,
//      each row with a verdict; the pre-token radar is the board's hero view,
//      and live rows carry the market's own value (their market cap) so the
//      board separates what already trades from what is still to come.
//   2. token odds: every pre-token row carries the token-record base rate of
//      its own category, shrunk toward the snapshot's global rate — the
//      peers' record, not a guess about this protocol.
//   3. costed farm plans: every farm step carries a dollar cost and minutes,
//      so each row totals its gas cost, its deployed capital, its active
//      hours and its cost per active hour ($/h).
//   4. integrity: every pre-token row carries its implied-value error band
//      from the held-out error (implied / 2.8x … implied x 2.8x), and the
//      dashboard states the band up front instead of hiding it.
//   5. versioned iteration: this is v2; the title and the model version say so.
//
// The board ranks every rankable pre-token protocol in the sealed snapshot by an
// implied token value. Nothing is hardcoded by name: every number below is fitted
// at runtime from the snapshot's own token-bearing protocols ("peers").
//
// The model, fitted on the peers:
//   log(mcap) = a + b * log(tvl) + category_residual
//   * a, b come from an ordinary-least-squares fit of log market cap on log TVL
//     over the peers. b < 1 means the mcap/TVL multiple falls as a protocol
//     grows: big protocols are worth fewer TVL-dollars per token dollar.
//   * category_residual is the median log-residual of the peers in the
//     protocol's category, shrunk toward 0 by n / (n + 10), so a category
//     with one or two peers barely moves the value and a category with many
//     peers earns its own multiple. Categories with no peers get residual 0.
//   * growth multiplies by 1 + 0.5 * clamp(change_7d, -60, 120) / 100.
//   * chains multiply by 1 + 0.06 * ln(number of chains).
//   * maturity multiplies by 0.7 + 0.3 * min(age_days, 1095) / 1095.
//     A protocol whose listed_at is missing is scored at 365 days.
//   implied = round(exp(a + b * ln(tvl) + residual) * growth * chains * maturity)
//
// The fit is tested, not trusted: the peers are split two ways (every 3rd peer
// held out; every odd peer held out), the model is fitted on the rest and scored
// on the held-out peers, and both splits are reported next to a global-median
// baseline fitted the same way. See evaluateHeldOut() and the dashboard's
// "How the value was fitted" section for the numbers.
//
// A protocol is rankable when it records no token (mcap, gecko_id and symbol
// all null) and is not a wrapped, staked or bridged product, not a versioned
// pool and not an exchange: the same exclusions the snapshot's watchlist uses.
// The watchlist is the floor, never the ceiling: the board carries every
// rankable pre-token protocol, watchlist or not.

/** One protocol entry: exactly the ten fields the sealed snapshot carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The fitted value model: OLS log-log coefficients plus shrunk category residuals. */
export interface ModelFit {
  intercept: number;
  tvl_exponent: number;
  peers: number;
  global_median_ratio: number;
  category_residual: Record<string, number>;
  category_peers: Record<string, number>;
  shrink_k: number;
}

/** One held-out test: the model fitted on the train peers, scored on the test peers. */
export interface HeldOutSplit {
  name: string;
  train_peers: number;
  test_peers: number;
  median_abs_log_error: number;
  within_2x: number;
  baseline_median_abs_log_error: number;
  baseline_within_2x: number;
}

/** The hyperparameters the dashboard states. */
export const HYPER = {
  shrink_k: 10,
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  chain_weight: 0.06,
  maturity_floor: 0.7,
  maturity_days: 1095,
  unknown_age_days: 365,
} as const;

export const MODEL_VERSION = 'launch-radar-v2';

/** A farm step: the action, what it costs, and how long it takes — in words and in numbers. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
  /** Gas and fees this step spends, in whole dollars. Deployed capital is not a cost: it stays yours. */
  cost_usd: number;
  /** Active minutes this step takes. Holding time is not active time. */
  time_minutes: number;
  /** Capital this step deploys, in whole dollars. */
  capital_usd: number;
}

/** A farm plan's cost, totalled: what the farmer spends, deploys and does. */
export interface FarmCost {
  /** Capital deployed across the plan, in whole dollars. */
  capital_usd: number;
  /** Gas and fees spent across the plan, in whole dollars. */
  cost_usd: number;
  /** Active minutes across the plan. */
  active_minutes: number;
  /** Gas and fees per active hour, in dollars, to two decimals. */
  cost_per_hour: number;
}

/** One row of board.json. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  /** 'pre-token': no token recorded. 'live': a token trades with a market cap. 'token-unpriced': a token is recorded but the snapshot carries no market cap for it. */
  token_status: 'pre-token' | 'live' | 'token-unpriced';
  watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  implied_per_tvl: number;
  /** The held-out error band: implied / factor … implied × factor. For live rows the market's value is exact, so low and high both equal the market cap. */
  implied_low_usd: number;
  implied_high_usd: number;
  /** This protocol's rank among the rankable pre-token rows alone, by implied value; null for live, unpriced and non-rankable rows. */
  radar_rank: number | null;
  /** One verdict per row: TOP FARM, WATCH, COOLING, EARLY, LIVE, UNPRICED, WRAPPED, VERSIONED, BRIDGE or EXCHANGE. */
  verdict: string;
  /** Why this row is what it is: 'wrapped', 'versioned', 'bridge' or 'exchange', when any applies. */
  flags: string[];
  /** The token odds: the shrunk base rate of protocols in this row's category recording a token. 1 for rows whose token already exists. */
  token_odds: number;
  /** How many protocols the odds' category group holds. */
  odds_group_n: number;
  /** How many of them record a token. */
  odds_group_tokens: number;
  /** The costed farm plan: capital, gas cost, active minutes and $/h. */
  farm: FarmCost;
  model: {
    intercept: number;
    tvl_exponent: number;
    category_residual: number;
    category_peers: number;
    growth_pct: number;
    growth_multiplier: number;
    chain_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  mcap_per_tvl: number | null;
}

/** Everything the dashboard renders. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  hyper: typeof HYPER;
  fit: ModelFit;
  held_out: HeldOutSplit[];
  watchlist_size: number;
  board_size: number;
  live_size: number;
  /** Rows by token status: pre-token, live, token-recorded-but-unpriced. */
  pre_token_size: number;
  live_token_size: number;
  unpriced_size: number;
  /** Rankable pre-token rows: the pre-token radar itself (pre-token, not an exchange, not versioned, not wrapped/staked/bridged). */
  rankable_size: number;
  total_tvl_board: number;
  total_implied_board: number;
  /** The split behind the total: model-implied value on pre-token and unpriced rows, market caps on live rows. */
  total_implied_pretoken: number;
  total_mcap_live: number;
  /** The snapshot's global token-record rate (protocols recording a token, over all protocols). */
  global_token_rate: number;
  /** The held-out error band factor: exp(split A median |log error|), so a row's band is implied / factor … implied × factor. */
  error_band_factor: number;
  rows: BoardRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The median of a non-empty list of numbers. */
export function median(values: number[]): number {
  const a = [...values].sort((x, y) => x - y);
  return a[Math.floor(a.length / 2)]!;
}

/** Whole days from `listedAt` to `asOf`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The token-bearing peers: a market cap, a TVL, and no exchange token. Sorted by slug. */
export function tokenPeers(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols
    .filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0 && p.category !== 'CEX')
    .sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
}

/**
 * Fit the model on `train` peers: OLS of log(mcap) on log(tvl), then each
 * category's median log-residual, shrunk toward zero by n / (n + shrink_k).
 */
export function fitModel(train: SnapshotProtocol[]): ModelFit {
  const xs = train.map((p) => Math.log(p.tvl_usd));
  const ys = train.map((p) => Math.log(p.mcap_usd!));
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0;
  let den = 0;
  xs.forEach((x, i) => {
    num += (x - mx) * (ys[i]! - my);
    den += (x - mx) * (x - mx);
  });
  const b = den === 0 ? 1 : num / den;
  const a = my - b * mx;
  const byCat = new Map<string, number[]>();
  for (const p of train) {
    const key = p.category ?? '(none)';
    const list = byCat.get(key) ?? [];
    list.push(Math.log(p.mcap_usd!) - (a + b * Math.log(p.tvl_usd)));
    byCat.set(key, list);
  }
  const category_residual: Record<string, number> = {};
  const category_peers: Record<string, number> = {};
  for (const [key, list] of [...byCat.entries()].sort((x, y) => (x[0] < y[0] ? -1 : 1))) {
    category_residual[key] = round4((list.length / (list.length + HYPER.shrink_k)) * median(list));
    category_peers[key] = list.length;
  }
  return {
    intercept: round4(a),
    tvl_exponent: round4(b),
    peers: train.length,
    global_median_ratio: round4(median(train.map((p) => p.mcap_usd! / p.tvl_usd))),
    category_residual,
    category_peers,
    shrink_k: HYPER.shrink_k,
  };
}

/** The multipliers and the implied value one protocol gets under a fitted model. */
export function impliedValue(
  p: SnapshotProtocol,
  asOf: string,
  fit: ModelFit,
): { implied: number; growthPct: number; growthMult: number; chainMult: number; maturityMult: number; age: number | null; residual: number; catPeers: number } {
  const age = ageDays(asOf, p.listed_at);
  const rawGrowth = finite(p.change_7d, 0);
  const growthPct = Math.min(HYPER.growth_cap, Math.max(HYPER.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * HYPER.growth_weight;
  const chainMult = 1 + HYPER.chain_weight * Math.log(Math.max(1, p.chains.length));
  const ageForModel = age ?? HYPER.unknown_age_days;
  const maturityMult = HYPER.maturity_floor + (1 - HYPER.maturity_floor) * (Math.min(Math.max(ageForModel, 0), HYPER.maturity_days) / HYPER.maturity_days);
  const key = p.category ?? '(none)';
  const residual = fit.category_residual[key] ?? 0;
  const catPeers = fit.category_peers[key] ?? 0;
  const base = Math.exp(fit.intercept + fit.tvl_exponent * Math.log(p.tvl_usd) + residual);
  const implied = Math.max(1, Math.round(base * growthMult * chainMult * maturityMult));
  return { implied, growthPct, growthMult, chainMult, maturityMult, age, residual, catPeers };
}

/**
 * The held-out tests, twice: split A holds out every 3rd peer by slug order,
 * split B holds out every odd peer. Each split fits the model on the train
 * peers only, predicts the held-out peers' market caps, and reports the median
 * absolute log error and the share of predictions within 2x of the real market
 * cap — next to the same numbers for a global-median-multiple baseline fitted
 * on the same train peers.
 */
export function evaluateHeldOut(peers: SnapshotProtocol[], asOf: string): HeldOutSplit[] {
  const splits: Array<{ name: string; test: (i: number) => boolean }> = [
    { name: 'split A — every 3rd peer held out', test: (i) => i % 3 === 2 },
    { name: 'split B — every odd peer held out', test: (i) => i % 2 === 1 },
  ];
  return splits.map(({ name, test }) => {
    const train = peers.filter((_, i) => !test(i));
    const held = peers.filter((_, i) => test(i));
    const fit = fitModel(train);
    const baselineRatio = median(train.map((p) => p.mcap_usd! / p.tvl_usd));
    const errs: number[] = [];
    const baseErrs: number[] = [];
    for (const p of held) {
      const { implied } = impliedValue(p, asOf, fit);
      errs.push(Math.abs(Math.log(implied / p.mcap_usd!)));
      baseErrs.push(Math.abs(Math.log((p.tvl_usd * baselineRatio) / p.mcap_usd!)));
      void implied;
    }
    const within = (list: number[], testPeers: SnapshotProtocol[], predict: (p: SnapshotProtocol) => number): number => {
      let n = 0;
      void list;
      testPeers.forEach((p) => {
        const r = predict(p) / p.mcap_usd!;
        if (r >= 0.5 && r <= 2) n++;
      });
      return round4(n / testPeers.length);
    };
    return {
      name,
      train_peers: train.length,
      test_peers: held.length,
      median_abs_log_error: round4(median(errs)),
      within_2x: within(errs, held, (p) => impliedValue(p, asOf, fit).implied),
      baseline_median_abs_log_error: round4(median(baseErrs)),
      baseline_within_2x: within(baseErrs, held, (p) => p.tvl_usd * baselineRatio),
    };
  });
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
/** Categories that are a wrapped, staked or bridged product of a token that already trades. */
const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
/** Exchange names a protocol name must not begin with. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;
/** Whole words that mark a wrapped or staked product. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not versioned, not wrapped/staked/bridged. */
export function isRankable(p: SnapshotProtocol): boolean {
  return (
    isPreToken(p) &&
    !EXCLUDED_CATEGORIES.has(p.category ?? '') &&
    !VERSIONED.test(p.name) &&
    !WRAPPED_WORD.test(p.name) &&
    !EXCHANGE_PREFIX.test(p.name)
  );
}

/** Whether the snapshot records a token for this protocol: a CoinGecko id or a symbol. */
export function hasTokenRecord(p: SnapshotProtocol): boolean {
  return p.gecko_id !== null || p.symbol !== null;
}

/** One category's token-record group: how many protocols it holds, and how many record a token. */
export interface OddsGroup {
  n: number;
  tokens: number;
}

/** The token-odds table: the global token-record rate and one group per category. */
export interface OddsTable {
  global_rate: number;
  by_category: Record<string, OddsGroup>;
}

/**
 * The token-odds table, from the snapshot's own record: for every category,
 * how many of its protocols record a token. Categories are the snapshot's
 * own; no protocol name is special-cased.
 */
export function tokenOddsTable(snapshot: Snapshot): OddsTable {
  const by_category: Record<string, OddsGroup> = {};
  let tokens = 0;
  for (const p of snapshot.protocols) {
    const key = p.category ?? '(none)';
    const g = by_category[key] ?? { n: 0, tokens: 0 };
    g.n += 1;
    if (hasTokenRecord(p)) {
      g.tokens += 1;
      tokens += 1;
    }
    by_category[key] = g;
  }
  return { global_rate: round4(tokens / snapshot.protocols.length), by_category };
}

/**
 * One protocol's token odds: its category's token-record rate, shrunk toward
 * the global rate by n / (n + 10) — the same shrinkage the value model uses
 * for category residuals, so a thin category barely moves the odds. A row
 * whose token already exists scores 1: the launch has happened. The odds are
 * a base rate among lookalike protocols, never a prediction that this one
 * launches, or when.
 */
export function tokenOdds(p: SnapshotProtocol, table: OddsTable): { odds: number; group_n: number; group_tokens: number } {
  if (hasTokenRecord(p)) return { odds: 1, group_n: table.by_category[p.category ?? '(none)']?.n ?? 0, group_tokens: table.by_category[p.category ?? '(none)']?.tokens ?? 0 };
  const g = table.by_category[p.category ?? '(none)'] ?? { n: 0, tokens: 0 };
  const rate = g.n === 0 ? table.global_rate : g.tokens / g.n;
  const odds = (g.n * rate + HYPER.shrink_k * table.global_rate) / (g.n + HYPER.shrink_k);
  return { odds: round4(odds), group_n: g.n, group_tokens: g.tokens };
}

/** The held-out error band for one implied value: implied / factor … implied × factor, rounded to whole dollars. */
export function errorBand(implied: number, factor: number): { low: number; high: number } {
  return { low: Math.max(1, Math.round(implied / factor)), high: Math.round(implied * factor) };
}

/** Why a pre-token protocol is not a launch to farm: wrapped/staked product, versioned pool, bridge or exchange. */
export function rowFlags(p: SnapshotProtocol): string[] {
  const flags: string[] = [];
  if (WRAPPED_WORD.test(p.name) || p.category === 'Liquid Staking' || p.category === 'Liquid Restaking' || p.category === 'Restaked BTC') flags.push('wrapped');
  if (VERSIONED.test(p.name)) flags.push('versioned');
  if (p.category === 'Bridge' || p.category === 'Canonical Bridge') flags.push('bridge');
  if (p.category === 'CEX' || EXCHANGE_PREFIX.test(p.name)) flags.push('exchange');
  return flags;
}

/**
 * One row's verdict. Live rows trade already; unpriced rows record a token
 * with no market cap in the snapshot; wrapped, versioned, bridge and exchange
 * rows are not launches to farm. Rankable pre-token rows are judged on the
 * pre-token radar alone: TOP FARM is a top-10 radar rank, or an implied/TVL
 * of 0.50× or more, with 7-day growth at or above zero; COOLING is 7-day
 * growth below −10%; WATCH is an implied/TVL of 0.30× or more, or a top-40
 * radar rank; everything else is EARLY.
 */
export function verdictFor(p: SnapshotProtocol, tokenStatus: 'pre-token' | 'live' | 'token-unpriced', radarRank: number | null, ratio: number): string {
  if (tokenStatus === 'live') return 'LIVE';
  if (tokenStatus === 'token-unpriced') return 'UNPRICED';
  const flags = rowFlags(p);
  if (flags.includes('exchange')) return 'EXCHANGE';
  if (flags.includes('wrapped')) return 'WRAPPED';
  if (flags.includes('versioned')) return 'VERSIONED';
  if (flags.includes('bridge')) return 'BRIDGE';
  const g = p.change_7d == null ? 0 : p.change_7d;
  if (g < -10) return 'COOLING';
  if (((radarRank !== null && radarRank <= 10) || ratio >= 0.5) && g >= 0) return 'TOP FARM';
  if (ratio >= 0.3 || (radarRank !== null && radarRank <= 40)) return 'WATCH';
  return 'EARLY';
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 1_000_000_000) return 250;
  if (p.tvl_usd >= 100_000_000) return 150;
  if (p.tvl_usd >= 50_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's core farming action, in words a farmer can follow. */
function coreAction(p: SnapshotProtocol, capital: number, chain: string): { action: string; weekly: string } {
  const c = (p.category ?? '').toLowerCase();
  const n = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral'))
    return {
      action: `Supply $${capital} of USDC as collateral to ${n} on ${chain} and borrow a small amount against it so both sides of the position are active`,
      weekly: `adjust the borrow or top up the collateral on ${n} once a week so the position stays active`,
    };
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm') || c.includes('liquidity manager'))
    return {
      action: `Provide $${capital} of liquidity to ${n}'s largest pool on ${chain} and keep the LP position open instead of withdrawing after one swap`,
      weekly: `swap a small amount through ${n} on ${chain} once a week and rebalance the LP range if the pool drifts`,
    };
  if (c.includes('bridge'))
    return {
      action: `Bridge $${capital} of USDC into ${chain} through ${n} and deploy the bridged funds in its app rather than bridging straight back out`,
      weekly: `bridge a small amount through ${n} once a week and use the destination funds on-chain`,
    };
  if (c.includes('stak') || c.includes('restak'))
    return {
      action: `Stake $${capital} of the chain's staking asset through ${n} on ${chain} and hold the staking receipt token in the same wallet`,
      weekly: `restake the rewards or add a small top-up to the ${n} stake once a week`,
    };
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options') || c.includes('synthetic'))
    return {
      action: `Deposit $${capital} of USDC as margin on ${n} on ${chain} and open one small hedged position, then close it the same week`,
      weekly: `open and close one small position on ${n} each week so trading volume accrues without leaving a large exposure open`,
    };
  if (c.includes('prediction'))
    return {
      action: `Fund ${n} on ${chain} with $${capital} and take one small position in an active market, holding it until the market resolves`,
      weekly: `place one small prediction on ${n} each week across different markets`,
    };
  if (c.includes('curator') || c.includes('allocator') || c.includes('onchain capital'))
    return {
      action: `Deposit $${capital} into a ${n} vault on ${chain} and hold the vault shares so the allocation is counted in the vault's TVL`,
      weekly: `check the ${n} vault's allocation once a week and move a small amount between its vaults when the strategy changes`,
    };
  if (c.includes('stable') || c.includes('algo-stables') || c.includes('dual-token'))
    return {
      action: `Mint or deposit $${capital} of the stable asset through ${n} on ${chain} and hold it in the wallet that minted it`,
      weekly: `mint, redeem or swap a small amount of the ${n} stable asset once a week`,
    };
  if (c.includes('rwa'))
    return {
      action: `Mint $${capital} of ${n}'s yield-bearing tokenised asset on ${chain} and hold it for the full accrual period`,
      weekly: `claim or compound the yield on the ${n} position once a week`,
    };
  if (c.includes('insurance'))
    return {
      action: `Buy $${capital} of cover from ${n} on ${chain} for a protocol you already use, and keep the policy active for the whole cover period`,
      weekly: `check the ${n} cover terms once a week and renew or extend the policy before it lapses`,
    };
  if (c.includes('basis'))
    return {
      action: `Deposit $${capital} into ${n}'s basis strategy on ${chain} and hold the position while the funding rate pays`,
      weekly: `check the funding rate on ${n} once a week and roll the position when the strategy rebalances`,
    };
  if (c.includes('launchpad'))
    return {
      action: `Stake $${capital} through ${n} on ${chain} to qualify for its launches and join one sale with a small allocation`,
      weekly: `vote or join one ${n} launch activity each week while the stake stays locked`,
    };
  if (c.includes('payment'))
    return {
      action: `Route $${capital} of real payments through ${n} on ${chain} — pay a bill or an invoice — and keep the receipt in the same wallet`,
      weekly: `make one payment through ${n} each week instead of batching everything into a single transfer`,
    };
  if (c.includes('chain'))
    return {
      action: `Bridge $${capital} onto the ${n} chain and use it in two different apps there, so the wallet shows real activity on the chain itself`,
      weekly: `use one app on the ${n} chain each week and keep a small balance deployed there`,
    };
  if (c.includes('governance'))
    return {
      action: `Deposit $${capital} into ${n} on ${chain} to earn voting power and cast a vote in its next active proposal`,
      weekly: `vote in every new ${n} proposal and post once in its governance forum each week`,
    };
  return {
    action: `Deposit $${capital} of USDC into ${n} on ${chain} and keep the position open through at least one full rewards period`,
    weekly: `make one qualifying action on ${n} each week, such as a deposit, a swap or a vote`,
  };
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time —
 * in words and in numbers. Every step carries its gas and fees in dollars,
 * its active minutes, and the capital it deploys, all derived from the
 * protocol's own record (name, category, chains, TVL, age), never from a
 * hand-written list of names. The weekly step repeats for the whole hold:
 * weeks = ceil(hold days / 7), so its cost and time are the weekly figures
 * times the weeks. Deployed capital is tracked apart from cost: capital stays
 * the farmer's, gas does not. When the token already exists (a live or
 * unpriced row) the first step says so: the plan is about using the protocol,
 * not a pre-launch farm.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null, tokenExists = false): FarmStep[] {
  const chain = chainOf(p);
  const secondChain = p.chains.length > 1 ? p.chains[1]! : null;
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const weeks = Math.ceil(hold / 7);
  const { action, weekly } = coreAction(p, capital, chain);
  const gas = capital >= 150 ? 8 : 4;
  const steps: FarmStep[] = [
    {
      text: tokenExists
        ? `The token already trades, so this plan is about using ${p.name} and earning from it, not a pre-launch farm. Use a fresh wallet that holds only the funds you plan to use with ${p.name}, and keep its seed phrase offline on paper`
        : `Use a fresh wallet that holds only the funds you plan to farm with ${p.name}, and keep its seed phrase offline on paper`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
      cost_usd: 3,
      time_minutes: 5,
      capital_usd: 0,
    },
    { text: action, cost: `$${capital} of capital and about $${gas} of gas`, time: '15 minutes to set up', cost_usd: gas, time_minutes: 15, capital_usd: capital },
    {
      text: `Do this weekly on ${chain} for ${weeks} weeks: ${weekly}.`,
      cost: `about $2 of gas a week, $${2 * weeks} over ${weeks} weeks`,
      time: `10 minutes a week, ${10 * weeks} minutes in all`,
      cost_usd: 2 * weeks,
      time_minutes: 10 * weeks,
      capital_usd: 0,
    },
    {
      text:
        secondChain === null
          ? `Hold the ${p.name} position for at least ${hold} days so the activity is counted in more than one snapshot, and do not withdraw early`
          : `Repeat the same ${p.name} position on ${secondChain} with a smaller $${Math.round(capital / 2)} deposit, so the wallet is active on two of its chains`,
      cost: secondChain === null ? `the $${capital} stays in the position` : `$${Math.round(capital / 2)} of extra capital and about $3 of gas`,
      time: secondChain === null ? `${hold} days` : '20 minutes to set up',
      cost_usd: secondChain === null ? 0 : 3,
      time_minutes: secondChain === null ? 0 : 20,
      capital_usd: secondChain === null ? 0 : Math.round(capital / 2),
    },
    {
      text: `Hold the position for at least ${hold} days in total, and before you withdraw open ${p.name}'s own points or rewards page and claim only from the link it publishes`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
      cost_usd: 0,
      time_minutes: 10,
      capital_usd: 0,
    },
    {
      text: `Write the wallet, the dates and every transaction for ${p.name} in a farm log so you can repeat the position or unwind it cleanly`,
      cost: 'nothing but the log',
      time: '5 minutes',
      cost_usd: 0,
      time_minutes: 5,
      capital_usd: 0,
    },
  ];
  return steps;
}

/** One plan's cost, totalled: capital deployed, gas and fees spent, active minutes, and $ per active hour. */
export function farmCost(steps: FarmStep[]): FarmCost {
  const capital_usd = steps.reduce((a, s) => a + s.capital_usd, 0);
  const cost_usd = steps.reduce((a, s) => a + s.cost_usd, 0);
  const active_minutes = steps.reduce((a, s) => a + s.time_minutes, 0);
  const cost_per_hour = active_minutes === 0 ? 0 : Math.round((cost_usd / (active_minutes / 60)) * 100) / 100;
  return { capital_usd, cost_usd, active_minutes, cost_per_hour };
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot, n = 24): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, n)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      mcap_per_tvl: p.mcap_usd !== null && p.tvl_usd > 0 ? round4(p.mcap_usd / p.tvl_usd) : null,
    }));
}

/**
 * The ranked board: every protocol in the snapshot, all 758, scored and ranked
 * by implied value. Pre-token rows take the model's implied value; live rows
 * take the market's own value, their market cap, so the board separates what
 * already trades from what is still to come; token-recorded-but-unpriced rows
 * take the model's estimate and say so. Ranks are exactly 1..N by implied
 * value, ties broken by slug, so the output is deterministic. Every row
 * carries its radar rank (pre-token rows only), its verdict, its token odds,
 * its held-out error band and its costed farm plan.
 */
export function buildBoard(snapshot: Snapshot, fit: ModelFit, errorFactor: number, oddsTable: OddsTable): BoardRow[] {
  const watch = new Set(snapshot.watchlist);
  const bySlug = (a: SnapshotProtocol, b: SnapshotProtocol): number => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);
  // The pre-token radar ranks, for verdicts: the rankable pre-token rows by
  // implied value. Non-rankable rows (an exchange, a wrapped product, a
  // versioned pool) take no radar rank: the radar is the farmable launches,
  // and its #1 is the top farmable protocol, not the biggest exchange.
  const rankable = snapshot.protocols.filter(isRankable);
  const preImplied = new Map<string, ReturnType<typeof impliedValue>>();
  for (const p of snapshot.protocols.filter(isPreToken)) preImplied.set(p.slug, impliedValue(p, snapshot.as_of, fit));
  const radarOrder = [...rankable].sort((a, b) => preImplied.get(b.slug)!.implied - preImplied.get(a.slug)!.implied || bySlug(a, b));
  const radarRank = new Map(radarOrder.map((p, i) => [p.slug, i + 1] as const));
  const scored = snapshot.protocols.map((p) => {
    const tokenStatus: BoardRow['token_status'] = isPreToken(p) ? 'pre-token' : p.mcap_usd !== null && p.mcap_usd > 0 ? 'live' : 'token-unpriced';
    const v = tokenStatus === 'live' ? impliedValue(p, snapshot.as_of, fit) : preImplied.get(p.slug) ?? impliedValue(p, snapshot.as_of, fit);
    const implied = tokenStatus === 'live' ? p.mcap_usd! : v.implied;
    const band = tokenStatus === 'live' ? { low: implied, high: implied } : errorBand(implied, errorFactor);
    const ratio = implied / p.tvl_usd;
    const rr = radarRank.get(p.slug) ?? null;
    const odds = tokenOdds(p, oddsTable);
    const steps = farmSteps(p, v.age, tokenStatus !== 'pre-token');
    return { p, v, tokenStatus, implied, band, ratio, rr, odds, steps };
  });
  scored.sort((a, b) => b.implied - a.implied || bySlug(a.p, b.p));
  return scored.map(({ p, v, tokenStatus, implied, band, ratio, rr, odds, steps }, i) => ({
    rank: i + 1,
    slug: p.slug,
    name: p.name,
    category: p.category,
    chains: p.chains,
    tvl_usd: p.tvl_usd,
    change_7d: p.change_7d,
    mcap_usd: p.mcap_usd,
    listed_at: p.listed_at,
    gecko_id: p.gecko_id,
    symbol: p.symbol,
    token_status: tokenStatus,
    watchlist: watch.has(p.slug),
    age_days: v.age,
    implied_value_usd: implied,
    implied_per_tvl: round4(ratio),
    implied_low_usd: band.low,
    implied_high_usd: band.high,
    radar_rank: rr,
    verdict: verdictFor(p, tokenStatus, rr, ratio),
    flags: rowFlags(p),
    token_odds: odds.odds,
    odds_group_n: odds.group_n,
    odds_group_tokens: odds.group_tokens,
    farm: farmCost(steps),
    model: {
      intercept: fit.intercept,
      tvl_exponent: fit.tvl_exponent,
      category_residual: v.residual,
      category_peers: v.catPeers,
      growth_pct: v.growthPct,
      growth_multiplier: round4(v.growthMult),
      chain_multiplier: round4(v.chainMult),
      maturity_multiplier: round4(v.maturityMult),
      age_days: v.age,
    },
    farm_steps: steps.map(stepText),
  }));
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const peers = tokenPeers(snapshot);
  const fit = fitModel(peers);
  const held_out = evaluateHeldOut(peers, snapshot.as_of);
  const oddsTable = tokenOddsTable(snapshot);
  // The error band factor: a typical held-out prediction lands this far off.
  const error_band_factor = Math.round(Math.exp(held_out[0]!.median_abs_log_error) * 100) / 100;
  const board = buildBoard(snapshot, fit, error_band_factor, oddsTable);
  const live = liveRows(snapshot);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    hyper: HYPER,
    fit,
    held_out,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    live_size: live.length,
    pre_token_size: board.filter((r) => r.token_status === 'pre-token').length,
    live_token_size: board.filter((r) => r.token_status === 'live').length,
    unpriced_size: board.filter((r) => r.token_status === 'token-unpriced').length,
    rankable_size: board.filter((r) => r.radar_rank !== null).length,
    total_tvl_board: board.reduce((a, r) => a + r.tvl_usd, 0),
    total_implied_board: board.reduce((a, r) => a + r.implied_value_usd, 0),
    total_implied_pretoken: board.filter((r) => r.token_status !== 'live').reduce((a, r) => a + r.implied_value_usd, 0),
    total_mcap_live: board.filter((r) => r.token_status === 'live').reduce((a, r) => a + r.implied_value_usd, 0),
    global_token_rate: oddsTable.global_rate,
    error_band_factor,
    rows: board,
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  if (board.length < 100 || board.length > 4000) return `the board holds ${board.length} rows, outside 100..4000`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.trim().length < 20 || s.trim().length > 600) return `${r.slug} has a farm step of ${s.trim().length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 1e14) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
