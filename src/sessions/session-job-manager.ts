/**
 * Session-Job Manager
 * 
 * Maps MPP payment sessions to Masumi job lifecycles.
 * 
 * When an external agent pays via MPP and starts a Masumi job,
 * we need to track:
 *   - Which MPP session/receipt paid for which job
 *   - The payment amount and settlement chain
 *   - Input hashes for cross-chain logging
 *   - Session state (active → completed → logged)
 * 
 * In production, replace the in-memory Map with PostgreSQL
 * (same DB as Masumi Payment Service).
 */

export interface SessionMapping {
  jobId: string;
  agentId: string;
  mppReceipt: any;
  purchaserId: string;
  inputHash?: string;
  paidAmount: number;
  paidCurrency: string;
  settledOn: 'tempo' | 'stripe' | 'cardano';
  state: 'active' | 'completed' | 'logged' | 'failed';
  /** Prevents duplicate decision-log writes when clients poll /status many times. */
  receiptLogged?: boolean;
  createdAt: Date;
  completedAt?: Date;
}

export interface CreateMappingInput {
  jobId: string;
  agentId: string;
  mppReceipt: any;
  purchaserId: string;
  inputHash?: string;
  paidAmount: number;
  paidCurrency: string;
  settledOn: 'tempo' | 'stripe' | 'cardano';
}

export class SessionJobManager {
  // In production: PostgreSQL table
  // CREATE TABLE session_job_mappings (
  //   job_id VARCHAR(64) PRIMARY KEY,
  //   agent_id VARCHAR(128) NOT NULL,
  //   mpp_receipt JSONB NOT NULL,
  //   purchaser_id VARCHAR(26) NOT NULL,
  //   input_hash VARCHAR(128),
  //   paid_amount DECIMAL(18,6) NOT NULL,
  //   paid_currency VARCHAR(8) NOT NULL,
  //   settled_on VARCHAR(16) NOT NULL,
  //   state VARCHAR(16) DEFAULT 'active',
  //   created_at TIMESTAMPTZ DEFAULT NOW(),
  //   completed_at TIMESTAMPTZ
  // );
  private mappings: Map<string, SessionMapping> = new Map();

  /**
   * Create a new session → job mapping after MPP payment verified
   */
  createMapping(input: CreateMappingInput): SessionMapping {
    const mapping: SessionMapping = {
      ...input,
      state: 'active',
      createdAt: new Date(),
    };
    this.mappings.set(input.jobId, mapping);
    console.log(`[Session] Mapped MPP payment → job ${input.jobId} (${input.paidAmount} ${input.paidCurrency} on ${input.settledOn})`);
    return mapping;
  }

  /**
   * Get the session mapping for a job
   */
  getSessionForJob(jobId: string): SessionMapping | undefined {
    return this.mappings.get(jobId);
  }

  /**
   * Mark a job's session as completed
   */
  completeSession(jobId: string): void {
    const mapping = this.mappings.get(jobId);
    if (mapping) {
      mapping.state = 'completed';
      mapping.completedAt = new Date();
      console.log(`[Session] Completed job ${jobId}`);
    }
  }

  /**
   * Mark a session as logged (cross-chain receipt recorded)
   */
  markLogged(jobId: string): void {
    const mapping = this.mappings.get(jobId);
    if (mapping) {
      mapping.state = 'logged';
      mapping.receiptLogged = true;
      console.log(`[Session] Receipt logged for job ${jobId}`);
    }
  }

  /** Mark cross-chain receipt as recorded (without changing lifecycle state). */
  markReceiptLogged(jobId: string): void {
    const mapping = this.mappings.get(jobId);
    if (mapping) {
      mapping.receiptLogged = true;
      mapping.state = 'logged';
    }
  }

  /**
   * Get all active sessions (for monitoring/cleanup)
   */
  getActiveSessions(): SessionMapping[] {
    return Array.from(this.mappings.values()).filter(m => m.state === 'active');
  }

  /**
   * Cleanup expired sessions (jobs that didn't complete within timeout)
   */
  cleanupExpired(timeoutMs: number = 3600000): number {
    const now = Date.now();
    let cleaned = 0;
    for (const [jobId, mapping] of this.mappings) {
      if (
        mapping.state === 'active' &&
        now - mapping.createdAt.getTime() > timeoutMs
      ) {
        mapping.state = 'failed';
        cleaned++;
        console.log(`[Session] Expired job ${jobId}`);
      }
    }
    return cleaned;
  }
}
