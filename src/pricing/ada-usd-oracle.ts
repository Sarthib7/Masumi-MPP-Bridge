/**
 * ADA/USD spot for converting registry lovelace prices into dollar amounts for MPP.
 * Fetches from CoinGecko public API with in-memory TTL + single-flight dedupe.
 * On failure: last good cached value, else `fallback` from config (default spot in `config.ts`).
 */

const COINGECKO_URL =
  'https://api.coingecko.com/api/v3/simple/price?ids=cardano&vs_currencies=usd';

type Memory = { value: number; at: number };

let memory: Memory | null = null;
let inflight: Promise<number> | null = null;

export type AdaUsdOracleParams = {
  /** When false, skip HTTP and use `fallback` only. */
  oracleEnabled: boolean;
  /** Seconds to treat cached value as fresh. */
  ttlSeconds: number;
  /** Used when oracle is disabled, fetch fails, and no prior cache. */
  fallback: number;
};

async function fetchCoinGecko(): Promise<number> {
  const res = await fetch(COINGECKO_URL, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) {
    throw new Error(`CoinGecko HTTP ${res.status}`);
  }
  const data = (await res.json()) as { cardano?: { usd?: number } };
  const usd = data.cardano?.usd;
  if (typeof usd !== 'number' || !Number.isFinite(usd) || usd <= 0) {
    throw new Error('CoinGecko: invalid cardano.usd');
  }
  return usd;
}

/**
 * Returns USD per 1 ADA (spot). Cached per `ttlSeconds`; concurrent callers share one fetch.
 */
export async function getAdaUsdSpot(params: AdaUsdOracleParams): Promise<number> {
  const { oracleEnabled, ttlSeconds, fallback } = params;
  if (!oracleEnabled) return fallback;

  const now = Date.now();
  const ttlMs = Math.max(10, ttlSeconds) * 1000;
  if (memory && now - memory.at < ttlMs) {
    return memory.value;
  }

  inflight ??= (async () => {
    try {
      const v = await fetchCoinGecko();
      memory = { value: v, at: Date.now() };
      return v;
    } catch (e) {
      console.warn('[ada-usd] oracle fetch failed:', e instanceof Error ? e.message : e);
      if (memory) return memory.value;
      return fallback;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}
