import { masumiAuthHeaders } from '../masumi-http.js';

/**
 * Agent Registry
 *
 * Uses the **Masumi Payment Service** `GET /api/v1/registry/...` HTTP API (same
 * pattern as pip-masumi). Auth: `PAYMENT_API_KEY` class keys (`token` / `x-api-key`).
 *
 * This is **not** the Sokosumi marketplace API; Sokosumi may use separate credentials
 * and listing rules. To back this with Sokosumi’s API, add a separate provider.
 *
 * Registry data reflects on-chain registration (MIP-002-style metadata).
 * 
 * Each registered agent has:
 *   - Agent identifier (unique on-chain ID)
 *   - API base URL (where MIP-003 endpoints are hosted)
 *   - Pricing (in lovelace)
 *   - Capabilities, description, example outputs
 */

export interface MasumiAgent {
  agentIdentifier: string;
  name: string;
  description: string;
  apiBaseUrl: string;
  pricingQuantity: string;
  pricingUnit: string;
  capabilities: string[];
  authorName?: string;
  authorOrganization?: string;
  exampleOutput?: string;
  status: 'active' | 'inactive';
  /**
   * When set (e.g. Sokosumi catalog), MPP charge uses this USD amount instead of
   * lovelace × ADA/USD oracle.
   */
  mppUsdOverride?: number;
}

export interface MasumiConfig {
  paymentServiceUrl: string;
  paymentApiKey: string;
  registryServiceUrl: string;
  registryApiKey: string;
  network: string;
  blockfrostApiKey: string;
}

export class AgentRegistry {
  private cache: Map<string, MasumiAgent> = new Map();
  private cacheExpiry: number = 0;
  private cacheTtlMs: number = 60000; // 1 minute cache

  constructor(private config: MasumiConfig) {}

  /**
   * List all available agents from Masumi Registry
   */
  async listAgents(): Promise<MasumiAgent[]> {
    if (Date.now() < this.cacheExpiry && this.cache.size > 0) {
      return Array.from(this.cache.values());
    }

    try {
      const res = await fetch(
        `${this.config.registryServiceUrl}/registry/?network=${this.config.network}`,
        {
          headers: masumiAuthHeaders(this.config.registryApiKey),
        }
      );

      if (!res.ok) {
        throw new Error(`Registry query failed: ${res.status}`);
      }

      const data = await res.json();
      const agents: MasumiAgent[] = (data.data || data.agents || []).map(
        (raw: any) => this.normalizeAgent(raw)
      );

      // Update cache
      this.cache.clear();
      for (const agent of agents) {
        this.cache.set(agent.agentIdentifier, agent);
      }
      this.cacheExpiry = Date.now() + this.cacheTtlMs;

      return agents;
    } catch (err) {
      console.error('[Registry] Failed to list agents:', err);
      // Return cached data if available, even if expired
      if (this.cache.size > 0) {
        return Array.from(this.cache.values());
      }
      throw err;
    }
  }

  /**
   * Get a specific agent by identifier
   */
  async getAgent(agentId: string): Promise<MasumiAgent | null> {
    // Check cache first
    if (this.cache.has(agentId) && Date.now() < this.cacheExpiry) {
      return this.cache.get(agentId) || null;
    }

    // Try specific lookup
    try {
      const res = await fetch(
        `${this.config.registryServiceUrl}/registry/${agentId}?network=${this.config.network}`,
        {
          headers: masumiAuthHeaders(this.config.registryApiKey),
        }
      );

      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Registry lookup failed: ${res.status}`);

      const data = await res.json();
      const agent = this.normalizeAgent(data.data || data);
      this.cache.set(agent.agentIdentifier, agent);
      return agent;
    } catch (_err) {
      // Fall back to list + filter
      const agents = await this.listAgents();
      return agents.find(a => a.agentIdentifier === agentId) || null;
    }
  }

  /**
   * Normalize various Masumi registry response formats
   * into our standard MasumiAgent shape
   */
  private normalizeAgent(raw: any): MasumiAgent {
    return {
      agentIdentifier: raw.agentIdentifier || raw.agent_identifier || raw.id || '',
      name: raw.name || raw.capability_name || 'Unknown Agent',
      description: raw.description || '',
      apiBaseUrl: raw.api_base_url || raw.apiBaseUrl || raw.api_url || '',
      pricingQuantity: String(raw.pricing_quantity || raw.pricingQuantity || raw.price || '0'),
      pricingUnit: raw.pricing_unit || raw.pricingUnit || 'lovelace',
      capabilities: raw.capabilities || raw.tags || [],
      authorName: raw.author_name || raw.authorName,
      authorOrganization: raw.author_organization || raw.authorOrganization,
      exampleOutput: raw.example_output || raw.exampleOutput,
      status: raw.status || 'active',
    };
  }
}
