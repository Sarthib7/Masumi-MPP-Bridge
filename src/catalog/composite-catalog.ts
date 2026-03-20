import type { MasumiAgent } from '../registry/agent-registry.js';
import { AgentRegistry } from '../registry/agent-registry.js';
import type { IAgentCatalog } from './agent-catalog-types.js';
import type { SokosumiCatalog } from './sokosumi-catalog.js';

export type CatalogMode = 'registry' | 'sokosumi' | 'both';

/**
 * `both`: union by `agentIdentifier`; Sokosumi row wins for name/description/pricing override,
 * missing `apiBaseUrl` is filled from the registry entry when present.
 */
export class CompositeCatalog implements IAgentCatalog {
  constructor(
    private mode: CatalogMode,
    private registry: AgentRegistry,
    private sokosumi: SokosumiCatalog | null,
  ) {}

  async listAgents(): Promise<MasumiAgent[]> {
    if (this.mode === 'registry') {
      return this.registry.listAgents();
    }
    if (this.mode === 'sokosumi') {
      if (!this.sokosumi) throw new Error('Sokosumi catalog not configured');
      return this.sokosumi.listAgents();
    }

    if (!this.sokosumi) return this.registry.listAgents();

    const [reg, sk] = await Promise.all([
      this.registry.listAgents().catch(() => [] as MasumiAgent[]),
      this.sokosumi.listAgents().catch(() => [] as MasumiAgent[]),
    ]);

    const byId = new Map<string, MasumiAgent>();
    for (const a of reg) {
      if (a.agentIdentifier) byId.set(a.agentIdentifier, { ...a });
    }
    for (const a of sk) {
      if (!a.agentIdentifier) continue;
      const prev = byId.get(a.agentIdentifier);
      if (!prev) {
        byId.set(a.agentIdentifier, { ...a });
        continue;
      }
      byId.set(a.agentIdentifier, {
        ...prev,
        name: a.name || prev.name,
        description: a.description || prev.description,
        capabilities: a.capabilities.length ? a.capabilities : prev.capabilities,
        mppUsdOverride: a.mppUsdOverride ?? prev.mppUsdOverride,
        pricingQuantity: a.pricingQuantity || prev.pricingQuantity,
        pricingUnit: a.pricingUnit || prev.pricingUnit,
        apiBaseUrl: a.apiBaseUrl || prev.apiBaseUrl,
        status: a.status === 'inactive' ? 'inactive' : prev.status,
      });
    }
    return Array.from(byId.values()).filter(a => a.status === 'active');
  }

  async getAgent(agentId: string): Promise<MasumiAgent | null> {
    if (this.mode === 'registry') {
      return this.registry.getAgent(agentId);
    }
    if (this.mode === 'sokosumi') {
      if (!this.sokosumi) throw new Error('Sokosumi catalog not configured');
      return this.sokosumi.getAgent(agentId);
    }

    if (!this.sokosumi) return this.registry.getAgent(agentId);

    const [reg, sk] = await Promise.all([
      this.registry.getAgent(agentId),
      this.sokosumi.getAgent(agentId),
    ]);
    if (!reg && !sk) return null;
    if (!sk) return reg;
    if (!reg) return sk;
    return {
      ...reg,
      name: sk.name || reg.name,
      description: sk.description || reg.description,
      capabilities: sk.capabilities.length ? sk.capabilities : reg.capabilities,
      mppUsdOverride: sk.mppUsdOverride ?? reg.mppUsdOverride,
      pricingQuantity: sk.pricingQuantity || reg.pricingQuantity,
      pricingUnit: sk.pricingUnit || reg.pricingUnit,
      apiBaseUrl: sk.apiBaseUrl || reg.apiBaseUrl,
      status: sk.status === 'inactive' ? 'inactive' : reg.status,
    };
  }
}
