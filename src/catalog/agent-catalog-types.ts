import type { MasumiAgent } from '../registry/agent-registry.js';

/**
 * Agent discovery + lookup for the bridge (registry, Sokosumi, or merged).
 */
export interface IAgentCatalog {
  listAgents(): Promise<MasumiAgent[]>;
  getAgent(agentId: string): Promise<MasumiAgent | null>;
}
