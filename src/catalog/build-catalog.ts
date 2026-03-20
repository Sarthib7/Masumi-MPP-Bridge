import { AgentRegistry, type MasumiConfig } from '../registry/agent-registry.js';
import { CompositeCatalog, type CatalogMode } from './composite-catalog.js';
import type { IAgentCatalog } from './agent-catalog-types.js';
import { logger } from '../lib/logger.js';
import { SokosumiCatalog } from './sokosumi-catalog.js';

export interface AgentCatalogEnv {
  catalogMode: CatalogMode;
  sokosumiApiBaseUrl: string;
  sokosumiApiKey: string;
  sokosumiCreditsToUsd: number;
  sokosumiCacheTtlMs: number;
}

/**
 * Wires the agent **listing** backend (registry, Sokosumi, or merged). Does not register agents.
 */
export function buildAgentCatalog(masumi: MasumiConfig, env: AgentCatalogEnv): IAgentCatalog {
  const registry = new AgentRegistry(masumi);
  const sokosumi =
    env.sokosumiApiKey.trim().length > 0
      ? new SokosumiCatalog({
          apiBaseUrl: env.sokosumiApiBaseUrl,
          apiKey: env.sokosumiApiKey,
          creditsToUsd: env.sokosumiCreditsToUsd,
          cacheTtlMs: env.sokosumiCacheTtlMs,
        })
      : null;

  if (env.catalogMode === 'sokosumi' && !sokosumi) {
    throw new Error(
      'AGENT_CATALOG=sokosumi requires SOKOSUMI_API_KEY (Bearer) on the server.',
    );
  }

  if (env.catalogMode === 'both' && !sokosumi) {
    logger.warn(
      'AGENT_CATALOG=both but SOKOSUMI_API_KEY is empty; falling back to registry-only.',
    );
    return registry;
  }

  if (env.catalogMode === 'registry' || !sokosumi) {
    return registry;
  }

  return new CompositeCatalog(env.catalogMode, registry, sokosumi);
}
