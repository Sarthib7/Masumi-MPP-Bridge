import type { MasumiAgent } from '../registry/agent-registry.js';
import type { IAgentCatalog } from './agent-catalog-types.js';

export interface SokosumiCatalogConfig {
  apiBaseUrl: string;
  /** Bearer token; required for current Sokosumi API (authenticated catalog). */
  apiKey: string;
  /** Multiply Sokosumi `price` / credits by this to get USD for MPP when no explicit USD field exists. */
  creditsToUsd: number;
  cacheTtlMs: number;
}

function trimSlash(s: string): string {
  return s.replace(/\/$/, '');
}

function extractAgentArray(payload: unknown): Record<string, unknown>[] {
  if (!payload || typeof payload !== 'object') return [];
  const o = payload as Record<string, unknown>;
  const from = (x: unknown): Record<string, unknown>[] =>
    Array.isArray(x) ? (x as Record<string, unknown>[]) : [];

  if (Array.isArray(o.data) && o.data.length && typeof o.data[0] === 'object') {
    return o.data as Record<string, unknown>[];
  }
  if (o.data && typeof o.data === 'object') {
    const inner = o.data as Record<string, unknown>;
    const nested = inner.data ?? inner.items ?? inner.agents;
    const arr = from(nested);
    if (arr.length) return arr;
  }
  const direct = from(o.agents).concat(from(o.items));
  if (direct.length) return direct;
  return [];
}

function num(raw: unknown): number | undefined {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string') {
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function str(raw: unknown): string {
  return typeof raw === 'string' ? raw : raw != null ? String(raw) : '';
}

/**
 * Map Sokosumi (or similar) JSON into the bridge's MasumiAgent shape.
 * Field names vary; we accept several aliases so responses can evolve without breaking the bridge.
 */
export function normalizeSokosumiAgent(
  raw: Record<string, unknown>,
  creditsToUsd: number,
): MasumiAgent {
  const agentIdentifier = str(
    raw.masumiAgentId ??
      raw.masumi_agent_id ??
      raw.agentIdentifier ??
      raw.agent_identifier ??
      raw.registryAgentId ??
      raw.id,
  );
  const apiBaseUrl = str(
    raw.apiBaseUrl ??
      raw.api_base_url ??
      raw.apiEndpoint ??
      raw.api_endpoint ??
      raw.apiUrl ??
      raw.api_url ??
      raw.mip003BaseUrl ??
      raw.endpoint,
  );

  const caps = raw.tags ?? raw.capabilities ?? raw.categories;
  const capabilities: string[] = Array.isArray(caps)
    ? caps.map(c => (typeof c === 'string' ? c : str((c as { slug?: string }).slug)))
    : [];

  const pricingObj = raw.pricing as Record<string, unknown> | undefined;

  const lovelace =
    num(raw.pricing_quantity) ??
    num(raw.pricingQuantity) ??
    num(pricingObj?.quantity) ??
    num(pricingObj?.amount_lovelace);

  const usdExplicit =
    num(raw.priceUsd) ??
    num(raw.usdPrice) ??
    num(raw.price_usd) ??
    num(pricingObj?.usd) ??
    num(pricingObj?.usdEquivalent);

  const credits =
    num(raw.price) ??
    num(raw.credits) ??
    num(raw.creditCost) ??
    num(pricingObj?.credits);

  let mppUsdOverride: number | undefined;
  let pricingQuantity: string;
  let pricingUnit: string;

  if (usdExplicit != null && usdExplicit > 0) {
    mppUsdOverride = usdExplicit;
    pricingQuantity = String(usdExplicit);
    pricingUnit = 'usd';
  } else if (lovelace != null && lovelace > 0) {
    pricingQuantity = String(Math.round(lovelace));
    pricingUnit = 'lovelace';
  } else if (credits != null && credits > 0) {
    mppUsdOverride = Math.max(0.0001, credits * creditsToUsd);
    pricingQuantity = String(mppUsdOverride);
    pricingUnit = 'usd';
  } else {
    pricingQuantity = '0';
    pricingUnit = 'lovelace';
  }

  const statusRaw = str(raw.status).toLowerCase();
  const status: 'active' | 'inactive' =
    statusRaw === 'inactive' || statusRaw === 'revoked' || statusRaw === 'expired'
      ? 'inactive'
      : 'active';

  return {
    agentIdentifier,
    name: str(raw.name) || 'Agent',
    description: str(raw.description),
    apiBaseUrl,
    pricingQuantity,
    pricingUnit,
    capabilities,
    authorName: str(raw.authorName || raw.author_name),
    authorOrganization: str(raw.authorOrganization || raw.author_organization),
    exampleOutput: str(raw.exampleOutput || raw.example_output),
    status,
    mppUsdOverride,
  };
}

export class SokosumiCatalog implements IAgentCatalog {
  private cache: MasumiAgent[] = [];
  private cacheExpiry = 0;

  constructor(private cfg: SokosumiCatalogConfig) {}

  private authHeaders(): Record<string, string> {
    const h: Record<string, string> = { Accept: 'application/json' };
    if (this.cfg.apiKey) {
      h.Authorization = `Bearer ${this.cfg.apiKey}`;
    }
    return h;
  }

  async listAgents(): Promise<MasumiAgent[]> {
    if (Date.now() < this.cacheExpiry && this.cache.length > 0) {
      return [...this.cache];
    }

    const base = trimSlash(this.cfg.apiBaseUrl);
    const url = `${base}/agents?limit=200`;
    const res = await fetch(url, { headers: this.authHeaders() });
    if (!res.ok) {
      throw new Error(`Sokosumi list agents failed: ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as unknown;
    const rows = extractAgentArray(json);
    const agents = rows
      .map(r => normalizeSokosumiAgent(r, this.cfg.creditsToUsd))
      .filter(a => a.agentIdentifier && a.status === 'active');

    this.cache = agents;
    this.cacheExpiry = Date.now() + this.cfg.cacheTtlMs;
    return [...agents];
  }

  async getAgent(agentId: string): Promise<MasumiAgent | null> {
    const listed = await this.listAgents();
    const hit = listed.find(
      a => a.agentIdentifier === agentId || a.agentIdentifier.endsWith(agentId),
    );
    if (hit) return hit;

    const base = trimSlash(this.cfg.apiBaseUrl);
    const url = `${base}/agents/${encodeURIComponent(agentId)}`;
    const res = await fetch(url, { headers: this.authHeaders() });
    if (res.status === 404) return null;
    if (!res.ok) {
      console.error('[Sokosumi] getAgent failed:', res.status, await res.text());
      return null;
    }
    const json = (await res.json()) as Record<string, unknown>;
    const raw = (json.data as Record<string, unknown>) || json;
    const agent = normalizeSokosumiAgent(raw, this.cfg.creditsToUsd);
    if (!agent.agentIdentifier) return null;
    return agent;
  }
}
