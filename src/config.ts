/**
 * Bridge configuration
 *
 * Environment names align with Masumi agent defaults (pip-masumi, masumi-docs):
 * - `PAYMENT_SERVICE_URL` / `PAYMENT_API_KEY` / `NETWORK`
 * The payment service also exposes registry routes under the same `/api/v1` base;
 * if you only set `PAYMENT_SERVICE_URL` (typical Railway / agent .env), registry
 * uses that same URL. Split registry + payment URLs are for docker quickstart.
 *
 * Bridge-specific overrides: `MASUMI_PAYMENT_URL`, `MASUMI_REGISTRY_URL`, `MASUMI_API_KEY`.
 */

function trimTrailingSlash(s: string): string {
  return s.replace(/\/$/, '');
}

function normalizeNetwork(raw: string): string {
  const s = raw.trim();
  const lower = s.toLowerCase();
  if (lower === 'preprod') return 'Preprod';
  if (lower === 'mainnet') return 'Mainnet';
  return s;
}

function parseCatalogMode(raw: string | undefined): 'registry' | 'sokosumi' | 'both' {
  const s = (raw || 'registry').trim().toLowerCase();
  if (s === 'sokosumi' || s === 'marketplace') return 'sokosumi';
  if (s === 'both' || s === 'merge' || s === 'merged') return 'both';
  return 'registry';
}

function resolveMasumiUrls(): {
  paymentServiceUrl: string;
  registryServiceUrl: string;
  paymentApiKey: string;
  registryApiKey: string;
  network: string;
  blockfrostApiKey: string;
} {
  const origin = process.env.MASUMI_SERVICES_ORIGIN?.trim();
  const regPort = process.env.MASUMI_REGISTRY_PORT || '3000';
  const payPort = process.env.MASUMI_PAYMENT_PORT || '3001';

  /** Prefer bridge-specific names, then agent-standard names from pip-masumi. */
  const paymentFromEnv =
    process.env.MASUMI_PAYMENT_URL?.trim() ||
    process.env.PAYMENT_SERVICE_URL?.trim();
  const registryFromEnv =
    process.env.MASUMI_REGISTRY_URL?.trim() ||
    process.env.REGISTRY_SERVICE_URL?.trim();

  const fromOrigin = origin
    ? {
        registry: `${trimTrailingSlash(origin)}:${regPort}/api/v1`,
        payment: `${trimTrailingSlash(origin)}:${payPort}/api/v1`,
      }
    : null;

  const paymentServiceUrl =
    paymentFromEnv ||
    fromOrigin?.payment ||
    'http://localhost:3001/api/v1';

  /** Same host as payment when using a single Masumi Node URL (production default). */
  const registryServiceUrl =
    registryFromEnv ||
    (paymentFromEnv ? paymentFromEnv : null) ||
    fromOrigin?.registry ||
    'http://localhost:3000/api/v1';

  const paymentApiKey =
    process.env.MASUMI_PAYMENT_API_KEY?.trim() ||
    process.env.PAYMENT_API_KEY?.trim() ||
    process.env.MASUMI_API_KEY?.trim() ||
    '';

  const registryApiKey =
    process.env.MASUMI_REGISTRY_API_KEY?.trim() ||
    process.env.PAYMENT_API_KEY?.trim() ||
    process.env.MASUMI_API_KEY?.trim() ||
    '';

  const network = normalizeNetwork(
    process.env.MASUMI_NETWORK?.trim() ||
      process.env.NETWORK?.trim() ||
      'Preprod',
  );

  return {
    paymentServiceUrl,
    registryServiceUrl,
    paymentApiKey,
    registryApiKey,
    network,
    blockfrostApiKey:
      process.env.BLOCKFROST_API_KEY?.trim() ||
      process.env.BLOCKFROST_API_KEY_PREPROD?.trim() ||
      '',
  };
}

export const config = {
  // --- Sokosumi marketplace catalog (optional; server-side only) ---
  sokosumi: {
    /** registry | sokosumi | both */
    catalogMode: parseCatalogMode(process.env.AGENT_CATALOG),
    apiBaseUrl: trimTrailingSlash(
      process.env.SOKOSUMI_API_URL?.trim() || 'https://api.sokosumi.com/v1',
    ),
    apiKey: process.env.SOKOSUMI_API_KEY?.trim() || '',
    /**
     * When Sokosumi returns a credit-style `price` without USD, MPP charge uses
     * price × this factor (e.g. 0.01 = one cent per credit). Tune to your org.
     */
    creditsToUsd: parseFloat(process.env.SOKOSUMI_CREDITS_TO_USD || '0.01'),
    cacheTtlMs: parseInt(process.env.SOKOSUMI_CACHE_TTL_MS || '60000', 10),
  },

  // --- Tempo / MPP settings ---
  tempo: {
    // pathUSD on Tempo mainnet
    currency: process.env.MPP_CURRENCY || '0x20c0000000000000000000000000000000000000',
    // Your bridge's receiving wallet on Tempo
    recipient: process.env.MPP_RECIPIENT || '',
    /** Required for real mppx (challenge signing). Dev stub runs if unset. */
    secretKey: process.env.MPP_SECRET_KEY || '',
    realm: process.env.MPP_REALM || 'masumi-mpp-bridge',
    // Set to true for Tempo testnet
    testnet: process.env.MPP_TESTNET === 'true',
    // Optional: Stripe integration for fiat MPP payments
    stripeEnabled: process.env.STRIPE_ENABLED === 'true',
    stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
  },

  // --- Masumi Network settings ---
  masumi: resolveMasumiUrls(),

  // --- Bridge settings ---
  bridge: {
    port: parseInt(process.env.PORT || '3002', 10),
    /**
     * Fallback USD per 1 ADA when oracle is disabled or fails (not USDCx). Not required in
     * `.env`: defaults to 0.45. Set `REGISTRY_ADA_USD_RATE` or `ADA_USD_PRICE` to override.
     */
    registryAdaUsdRate: parseFloat(
      process.env.REGISTRY_ADA_USD_RATE || process.env.ADA_USD_PRICE || '0.45',
    ),
    /** When true (default), fetch ADA/USD from CoinGecko with TTL cache; false = static fallback only. */
    adaUsdOracleEnabled: process.env.ADA_USD_ORACLE_ENABLED !== 'false',
    /** How long to reuse a successful oracle value (seconds). */
    adaUsdCacheTtlSeconds: parseInt(process.env.ADA_USD_CACHE_TTL_SECONDS || '120', 10),
    // Minimum charge in USD (MPP floor)
    minChargeUsd: parseFloat(process.env.MIN_CHARGE_USD || '0.01'),
    // Enable cross-chain receipt logging
    receiptLogging: process.env.RECEIPT_LOGGING !== 'false',
  },
} as const;

export type Config = typeof config;
