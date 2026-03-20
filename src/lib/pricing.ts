import type { Config } from '../config.js';
import { getAdaUsdSpot, type AdaUsdOracleParams } from '../pricing/ada-usd-oracle.js';
import type { MasumiAgent } from '../registry/agent-registry.js';

export function adaOracleParams(bridge: Config['bridge']): AdaUsdOracleParams {
  return {
    oracleEnabled: bridge.adaUsdOracleEnabled,
    ttlSeconds: bridge.adaUsdCacheTtlSeconds,
    fallback: bridge.registryAdaUsdRate,
  };
}

export async function lovelaceToUsd(
  lovelaceStr: string,
  oracle: AdaUsdOracleParams,
  minChargeUsd: number,
): Promise<number> {
  const rate = await getAdaUsdSpot(oracle);
  const lovelace = parseInt(lovelaceStr, 10);
  if (Number.isNaN(lovelace)) return minChargeUsd;
  const usd = (lovelace / 1_000_000) * rate;
  return Math.max(minChargeUsd, parseFloat(usd.toFixed(4)));
}

export async function resolveMppChargeUsd(
  agent: MasumiAgent,
  oracle: AdaUsdOracleParams,
  minChargeUsd: number,
): Promise<number> {
  if (agent.mppUsdOverride != null && Number.isFinite(agent.mppUsdOverride)) {
    return Math.max(minChargeUsd, agent.mppUsdOverride);
  }
  const unit = agent.pricingUnit?.toLowerCase() || '';
  if (unit === 'usd' || unit === 'usdc' || unit === 'credit_usd') {
    const n = parseFloat(agent.pricingQuantity);
    if (Number.isFinite(n)) {
      return Math.max(minChargeUsd, parseFloat(n.toFixed(4)));
    }
  }
  return lovelaceToUsd(agent.pricingQuantity, oracle, minChargeUsd);
}
