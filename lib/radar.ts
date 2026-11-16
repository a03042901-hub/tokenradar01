/**
 * Token Launch Radar — value model and farm-plan builders.
 *
 * Deterministic: no Date.now(), no Math.random(), no network.
 * All timestamps derive from snapshot.as_of / listed_at.
 */

export type Protocol = {
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
};

export type Snapshot = {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
};

export type ValueBreakdown = {
  tvl_usd: number;
  category: string;
  category_multiple: number;
  base_usd: number;
  momentum_pct: number | null;
  momentum_factor: number;
  days_without_token: number | null;
  maturity_factor: number;
  raw_score: number;
  /** Dollar contribution attributed to momentum vs base (can be negative). */
  momentum_usd: number;
  /** Dollar contribution attributed to maturity vs (base×momentum). */
  maturity_usd: number;
};

export type BoardRow = {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  farm_steps: string[];
};

export type EnrichedRow = BoardRow & {
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  watchlist: boolean;
  pre_token: boolean;
  score: number;
  breakdown: ValueBreakdown;
};

export type LaunchedRef = {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  symbol: string | null;
  gecko_id: string | null;
};

const DERIVATIVE_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Cross Chain Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
  'Anchor BTC',
]);

const EXCHANGE_PREFIX =
  /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;

const WRAP_WORD =
  /\b(wrapped|staked|staking|restaked|restaking|bridged)\b/i;

const WRAP_TICKER =
  /(^|[^a-z])(wbtc|weth|steth|weeth|cbeth|reth|sfrxeth|wbnb|wavax|wmatic|wsol)([^a-z]|$)/i;

const WRAP_SLUG =
  /(^|-)(wrapped|staked|staking|restaked|restaking|liquid-staking|liquid-restaking|bridge)(-|$)/i;

/** Category → TVL multiple. Higher for venues that historically support valuable token launches. */
const CATEGORY_MULTIPLE: Record<string, number> = {
  Chain: 2.55,
  Dexs: 2.35,
  Derivatives: 2.3,
  Lending: 2.2,
  Restaking: 2.15,
  CDP: 2.05,
  RWA: 2.0,
  'Yield Aggregator': 1.95,
  Yield: 1.9,
  'Risk Curators': 1.9,
  'Onchain Capital Allocator': 1.85,
  Insurance: 1.75,
  'Prediction Market': 1.7,
  'Liquidity Manager': 1.65,
  Farm: 1.45,
  CeDeFi: 1.4,
  Payments: 1.35,
  'Algo-Stables': 1.25,
  'Dual-Token Stablecoin': 1.2,
};

const DEFAULT_MULTIPLE = 1.55;

export function isPreToken(p: Protocol): boolean {
  return p.gecko_id == null && p.symbol == null;
}

/**
 * Heuristic: wrapped / staked / restaked / bridge / CEX wrappers of assets that already trade.
 * Applied ONLY to non-watchlist protocols — watchlist slugs are never dropped.
 */
export function isDerivativeWrapper(p: Protocol): boolean {
  const cat = p.category ?? '';
  if (DERIVATIVE_CATEGORIES.has(cat)) return true;
  if (EXCHANGE_PREFIX.test(p.name)) return true;
  if (WRAP_WORD.test(p.name)) return true;
  if (WRAP_TICKER.test(p.name) || WRAP_TICKER.test(p.slug)) return true;
  if (WRAP_SLUG.test(p.slug)) return true;
  return false;
}

function parseDay(iso: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return 0;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  // Civil-day ordinal from a fixed epoch (proleptic Gregorian), deterministic.
  const adj = mo <= 2 ? -1 : 0;
  const y2 = y + adj;
  const m2 = mo + (adj === -1 ? 12 : 0);
  return (
    365 * y2 +
    Math.floor(y2 / 4) -
    Math.floor(y2 / 100) +
    Math.floor(y2 / 400) +
    Math.floor((153 * (m2 - 3) + 2) / 5) +
    d
  );
}

export function daysBetween(from: string, to: string): number {
  return parseDay(to) - parseDay(from);
}

export function categoryMultiple(category: string | null): number {
  if (!category) return DEFAULT_MULTIPLE;
  return CATEGORY_MULTIPLE[category] ?? DEFAULT_MULTIPLE;
}

function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}

/**
 * Maturity curve over days without a recorded token.
 * Young (<60d): discount — product still forming.
 * Peak (120–420d): premium — enough traction, launch window still open.
 * Very old (>720d): mild discount — long silence lowers launch odds in this model.
 */
export function maturityFactor(days: number | null): number {
  if (days == null) return 1.0;
  if (days < 0) return 0.85;
  if (days < 60) return 0.78 + (days / 60) * 0.18;
  if (days < 120) return 0.96 + ((days - 60) / 60) * 0.08;
  if (days <= 420) return 1.04 + ((days - 120) / 300) * 0.08;
  if (days <= 720) return 1.12 - ((days - 420) / 300) * 0.18;
  return 0.9;
}

export function momentumFactor(change7d: number | null): number {
  if (change7d == null) return 1.0;
  const pct = clamp(change7d / 100, -0.3, 0.5);
  return 1 + pct * 0.85;
}

export function computeValue(p: Protocol, floorUsd: number, asOf: string): ValueBreakdown {
  const cat = p.category ?? 'Unknown';
  const k = categoryMultiple(p.category);
  const base = Math.max(floorUsd, k * p.tvl_usd);
  const mom = momentumFactor(p.change_7d);
  const days = p.listed_at ? daysBetween(p.listed_at, asOf) : null;
  const mat = maturityFactor(days);
  const afterMom = base * mom;
  const raw = afterMom * mat;
  return {
    tvl_usd: p.tvl_usd,
    category: cat,
    category_multiple: k,
    base_usd: base,
    momentum_pct: p.change_7d,
    momentum_factor: mom,
    days_without_token: days,
    maturity_factor: mat,
    raw_score: raw,
    momentum_usd: afterMom - base,
    maturity_usd: raw - afterMom,
  };
}

function gasForChain(chain: string): number {
  const c = chain.toLowerCase();
  if (c === 'ethereum') return 18;
  if (c === 'bitcoin') return 12;
  if (c === 'solana') return 0.05;
  if (c === 'binance' || c === 'bsc') return 0.4;
  if (c === 'avalanche') return 0.6;
  if (c === 'polygon') return 0.15;
  if (c === 'arbitrum' || c === 'optimism' || c === 'base') return 0.35;
  if (c === 'tron') return 1.2;
  return 0.8;
}

function primaryChain(chains: string[]): string {
  if (!chains.length) return 'Ethereum';
  const prefer = ['Ethereum', 'Solana', 'Base', 'Arbitrum', 'Optimism', 'Binance', 'Avalanche'];
  for (const p of prefer) {
    if (chains.includes(p)) return p;
  }
  return chains[0]!;
}

function depositBand(tvl: number): { usd: number; label: string } {
  if (tvl >= 500_000_000) return { usd: 5000, label: '$5,000' };
  if (tvl >= 100_000_000) return { usd: 2500, label: '$2,500' };
  if (tvl >= 50_000_000) return { usd: 1500, label: '$1,500' };
  if (tvl >= 20_000_000) return { usd: 1000, label: '$1,000' };
  return { usd: 500, label: '$500' };
}

function holdWeeks(days: number | null): number {
  if (days == null) return 8;
  if (days < 90) return 12;
  if (days < 365) return 8;
  return 6;
}

function trimStep(s: string): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length < 20) return (t + ' — complete this step carefully.').slice(0, 600);
  return t.slice(0, 600);
}

/**
 * Concrete, protocol-specific farm plan: exact action, estimated USD cost, estimated time.
 * Steps vary by category and primary chain.
 */
export function buildFarmSteps(p: Protocol, asOf: string): string[] {
  const chain = primaryChain(p.chains);
  const gas = gasForChain(chain);
  const band = depositBand(p.tvl_usd);
  const days = p.listed_at ? daysBetween(p.listed_at, asOf) : null;
  const weeks = holdWeeks(days);
  const cat = (p.category ?? 'Protocol').toLowerCase();
  const alt = p.chains.filter((c) => c !== chain).slice(0, 2);
  const altNote = alt.length ? ` Also tracked on ${alt.join(' / ')}.` : '';
  const steps: string[] = [];

  steps.push(
    trimStep(
      `Bridge or transfer working capital to ${chain} for ${p.name} (~$${gas.toFixed(2)} gas, ~10–25 min including confirmations).${altNote}`,
    ),
  );

  if (/dex|swap|amm/.test(cat) || cat === 'dexs') {
    steps.push(
      trimStep(
        `Swap a small probe (~$50) through ${p.name}'s primary pool on ${chain} to create a swap history (~$${gas.toFixed(2)} gas, ~5 min).`,
      ),
    );
    steps.push(
      trimStep(
        `Provide ${band.label} of two-sided liquidity to ${p.name}'s deepest pool; stake LP if a gauge exists (~$${gas.toFixed(2)} gas, ~20 min).`,
      ),
    );
    steps.push(
      trimStep(
        `Rebalance or claim fees weekly for ${weeks} weeks so activity spans multiple epochs (~$${gas.toFixed(2)}/week, ~15 min each).`,
      ),
    );
  } else if (/lend|cdp|borrow/.test(cat)) {
    steps.push(
      trimStep(
        `Supply ${band.label} of a core asset into ${p.name}'s main lending market on ${chain} (~$${gas.toFixed(2)} gas, ~15 min).`,
      ),
    );
    steps.push(
      trimStep(
        `Borrow a modest amount (~25% LTV) against that collateral inside ${p.name}, then repay within 48h to record both sides (~$${gas.toFixed(2)} gas, ~20 min).`,
      ),
    );
    steps.push(
      trimStep(
        `Keep the supply position open for ${weeks} weeks; top up or withdraw a dust amount weekly to show ongoing use (~$${gas.toFixed(2)}/touch, ~10 min).`,
      ),
    );
  } else if (/derivative|perps|options|basis/.test(cat)) {
    steps.push(
      trimStep(
        `Deposit ${band.label} margin into ${p.name}'s trading vault on ${chain} (~$${gas.toFixed(2)} gas, ~15 min).`,
      ),
    );
    steps.push(
      trimStep(
        `Open and close at least two small perpetual or options tickets on ${p.name} (target <$5 fees each, ~30 min total).`,
      ),
    );
    steps.push(
      trimStep(
        `Maintain margin for ${weeks} weeks and trade once per week so volume accrues across epochs (~$3–$8 fees/week, ~20 min).`,
      ),
    );
  } else if (/restak|stake|liquid/.test(cat)) {
    steps.push(
      trimStep(
        `Deposit ${band.label} into ${p.name}'s primary restake/stake pool on ${chain} (~$${gas.toFixed(2)} gas, ~20 min).`,
      ),
    );
    steps.push(
      trimStep(
        `Delegate or restake the receipt token through ${p.name}'s recommended operator set if prompted (~$${gas.toFixed(2)} gas, ~15 min).`,
      ),
    );
    steps.push(
      trimStep(
        `Hold the position for ${weeks} weeks; claim rewards weekly without fully exiting (~$${gas.toFixed(2)}/claim, ~10 min).`,
      ),
    );
  } else if (/risk curator/.test(cat)) {
    steps.push(
      trimStep(
        `Allocate ${band.label} into ${p.name}'s highest-TVL curated vault on ${chain} (accept the curator risk params, ~$${gas.toFixed(2)} gas, ~20 min).`,
      ),
    );
    steps.push(
      trimStep(
        `Split a second ${Math.max(250, Math.round(band.usd / 5))} USD slice into a different ${p.name} vault on ${chain} so the address touches ≥2 strategies (~$${gas.toFixed(2)} gas, ~15 min).`,
      ),
    );
    steps.push(
      trimStep(
        `Harvest or rebalance each vault weekly for ${weeks} weeks without full exit (~$${gas.toFixed(2)}/touch, ~10 min).`,
      ),
    );
  } else if (/capital allocator|yield|farm|rwa|insurance/.test(cat)) {
    steps.push(
      trimStep(
        `Deposit ${band.label} into ${p.name}'s flagged vault or curated pool on ${chain} (~$${gas.toFixed(2)} gas, ~20 min).`,
      ),
    );
    steps.push(
      trimStep(
        `Enable auto-compound or harvest once inside ${p.name} so the vault records an active farmer (~$${gas.toFixed(2)} gas, ~10 min).`,
      ),
    );
    steps.push(
      trimStep(
        `Leave capital deployed for ${weeks} weeks; harvest weekly and leave principal intact (~$${gas.toFixed(2)}/harvest, ~10 min).`,
      ),
    );
  } else if (/chain|bridge|payment/.test(cat)) {
    steps.push(
      trimStep(
        `Send ${band.label} across ${p.name}'s native path onto ${chain}, then reverse a dust leg to prove round-trip use (~$${gas.toFixed(2)}–$${(gas * 2).toFixed(2)} gas, ~30 min).`,
      ),
    );
    steps.push(
      trimStep(
        `Interact with one dapp that settles through ${p.name} on ${chain} (swap or mint, ~$20 notional, ~15 min).`,
      ),
    );
    steps.push(
      trimStep(
        `Repeat a small transfer weekly for ${weeks} weeks to keep the address active on ${p.name} (~$${gas.toFixed(2)}/week, ~10 min).`,
      ),
    );
  } else {
    steps.push(
      trimStep(
        `Deposit ${band.label} into ${p.name}'s primary pool or vault on ${chain} (~$${gas.toFixed(2)} gas, ~20 min).`,
      ),
    );
    steps.push(
      trimStep(
        `Complete one secondary action inside ${p.name} (stake, lock, vote, or claim) so the account is more than a single deposit (~$${gas.toFixed(2)} gas, ~15 min).`,
      ),
    );
    steps.push(
      trimStep(
        `Hold for ${weeks} weeks and touch the position weekly (claim or rebalance) until ${asOf} + ${weeks}w (~$${gas.toFixed(2)}/week, ~10 min).`,
      ),
    );
  }

  steps.push(
    trimStep(
      `Document tx hashes for ${p.name} on ${chain} and avoid withdrawing the full ${band.label} until the ${weeks}-week farm window ends (0 extra cost, ~5 min logging).`,
    ),
  );

  // Cap 3–12; we produce 5 typically.
  while (steps.length < 3) {
    steps.push(
      trimStep(
        `Stay active on ${p.name} (${chain}) with a weekly micro-interaction under $${gas.toFixed(2)} gas for ${weeks} weeks.`,
      ),
    );
  }
  return steps.slice(0, 12);
}

export type RadarResult = {
  rows: EnrichedRow[];
  launched: LaunchedRef[];
  boardSize: number;
};

/**
 * Build the ranked radar board.
 * - Watchlist slugs always included (even if a derivative heuristic would match).
 * - Non-watchlist: pre-token only, derivative wrappers excluded.
 * - Tokened protocols are omitted from the ranked board (returned separately as launched refs).
 */
export function buildRadar(snapshot: Snapshot, targetExtra = 180): RadarResult {
  const watch = new Set(snapshot.watchlist);
  const bySlug = new Map(snapshot.protocols.map((p) => [p.slug, p]));

  const launched: LaunchedRef[] = snapshot.protocols
    .filter((p) => !isPreToken(p))
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains.slice(),
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      symbol: p.symbol,
      gecko_id: p.gecko_id,
    }))
    .sort((a, b) => {
      const am = a.mcap_usd ?? -1;
      const bm = b.mcap_usd ?? -1;
      if (bm !== am) return bm - am;
      if (b.tvl_usd !== a.tvl_usd) return b.tvl_usd - a.tvl_usd;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    })
    .slice(0, 80);

  const candidates: Protocol[] = [];
  const seen = new Set<string>();

  for (const slug of snapshot.watchlist) {
    const p = bySlug.get(slug);
    if (!p) continue;
    candidates.push(p);
    seen.add(slug);
  }

  const early = snapshot.protocols
    .filter((p) => !seen.has(p.slug) && isPreToken(p) && !isDerivativeWrapper(p))
    .sort((a, b) => {
      const sa = computeValue(a, snapshot.floor_usd, snapshot.as_of).raw_score;
      const sb = computeValue(b, snapshot.floor_usd, snapshot.as_of).raw_score;
      if (sb !== sa) return sb - sa;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });

  for (const p of early) {
    if (candidates.length >= snapshot.watchlist.length + targetExtra) break;
    candidates.push(p);
    seen.add(p.slug);
  }

  // Ensure ≥60 non-watchlist even if targetExtra was small.
  while (candidates.length < snapshot.watchlist.length + 60 && early.length) {
    const p = early[candidates.length - snapshot.watchlist.length];
    if (!p || seen.has(p.slug)) break;
    candidates.push(p);
    seen.add(p.slug);
  }

  const scored = candidates.map((p) => {
    const breakdown = computeValue(p, snapshot.floor_usd, snapshot.as_of);
    return { p, breakdown, raw: breakdown.raw_score };
  });

  scored.sort((a, b) => {
    if (b.raw !== a.raw) return b.raw - a.raw;
    // Watchlist tie-break preference when raw equal, then slug.
    const aw = watch.has(a.p.slug) ? 1 : 0;
    const bw = watch.has(b.p.slug) ? 1 : 0;
    if (bw !== aw) return bw - aw;
    return a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0;
  });

  // Assign strictly decreasing positive integer implied values (never rise as rank worsens).
  const rows: EnrichedRow[] = [];
  let prevValue = 0;
  for (let i = 0; i < scored.length; i++) {
    const { p, breakdown, raw } = scored[i]!;
    const rank = i + 1;
    let value = Math.max(1, Math.round(raw));
    if (i === 0) {
      prevValue = value;
    } else {
      // Strictly below previous rank's value.
      if (value >= prevValue) value = prevValue - 1;
      if (value < 1) {
        // Shift: rare pathological case — re-base from the top.
        // Instead, subtract rank offset from a high ceiling derived from rank-1.
        value = Math.max(1, prevValue - 1);
      }
      prevValue = value;
    }
    // If we somehow collapsed, force unique decreasing chain from a safe ceiling.
    rows.push({
      slug: p.slug,
      name: p.name,
      rank,
      implied_value_usd: value,
      farm_steps: buildFarmSteps(p, snapshot.as_of),
      category: p.category,
      chains: p.chains.slice(),
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      listed_at: p.listed_at,
      watchlist: watch.has(p.slug),
      pre_token: isPreToken(p),
      score: raw,
      breakdown: {
        ...breakdown,
        base_usd: Math.round(breakdown.base_usd),
        raw_score: Math.round(breakdown.raw_score),
        momentum_usd: Math.round(breakdown.momentum_usd),
        maturity_usd: Math.round(breakdown.maturity_usd),
      },
    });
  }

  // Guarantee strictly decreasing values even if rounding collapsed the tail.
  if (rows.length >= 2) {
    for (let i = 1; i < rows.length; i++) {
      if (rows[i]!.implied_value_usd >= rows[i - 1]!.implied_value_usd) {
        rows[i]!.implied_value_usd = Math.max(1, rows[i - 1]!.implied_value_usd - 1);
      }
    }
    // If the floor hit 1 for many rows, rebuild from the top with unit steps for the tail.
    let needRebuild = false;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i]!.implied_value_usd >= rows[i - 1]!.implied_value_usd) {
        needRebuild = true;
        break;
      }
    }
    if (needRebuild || rows.every((r) => r.implied_value_usd === rows[0]!.implied_value_usd)) {
      const top = Math.max(rows[0]!.implied_value_usd, rows.length + 10);
      for (let i = 0; i < rows.length; i++) {
        rows[i]!.implied_value_usd = top - i;
      }
    }
  }

  return { rows, launched, boardSize: rows.length };
}

export const METHODOLOGY = {
  title: 'Implied launch value model',
  summary:
    'Pre-token protocols are scored from snapshot TVL, category multiples, 7-day TVL momentum, and time without a recorded token. The detail pane shows each factor as a dollar contribution. Rank 1 is the highest implied_value_usd.',
  formula:
    'raw = max(floor_usd, k_category × TVL) × momentum × maturity; implied_value_usd = strictly decreasing positive integers from sorted raw scores.',
  factors: [
    {
      name: 'Base',
      detail:
        'max(floor_usd, k×TVL). floor_usd is the snapshot floor ($50M). k is category-sensitive (Chain/Dexs/Lending/Restaking/Risk Curators elevated; Farm/stables lower).',
    },
    {
      name: 'Momentum',
      detail:
        'Factor 1 + clamp(change_7d/100, −30%, +50%) × 0.85. Dollar contribution = base×momentum − base (signed).',
    },
    {
      name: 'Maturity',
      detail:
        'Curve on days(listed_at → as_of): discount <60d, peak ~120–420d, mild discount after ~720d. Dollar contribution = raw − base×momentum.',
    },
    {
      name: 'Universe',
      detail:
        'Board = all 40 watchlist slugs (always kept) + ~180 other pre-token protocols. Non-watchlist wrapped/staked/restaked/bridge/CEX wrappers are excluded via name/category/slug heuristics. Tokened protocols appear only on the Launched reference tab.',
    },
  ],
};
