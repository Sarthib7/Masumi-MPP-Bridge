/**
 * Receipt Logger
 * 
 * Bridges MPP payment receipts to Masumi's decision logging system.
 * 
 * After a job completes:
 *   1. Takes the MPP receipt (proof of payment on Tempo)
 *   2. Takes the job's input/output hashes
 *   3. Creates a combined hash
 *   4. Submits to Masumi Payment Service for on-chain logging on Cardano
 * 
 * This creates a cross-chain audit trail:
 *   - Payment settled on Tempo (fast, cheap)
 *   - Accountability logged on Cardano (immutable, auditable)
 */

import { createHash } from 'crypto';
import { masumiAuthHeaders } from '../masumi-http.js';

export interface ReceiptLogEntry {
  jobId: string;
  agentId: string;
  mppReceipt: any;
  inputHash?: string;
  outputHash?: string | null;
}

export interface MasumiConfig {
  paymentServiceUrl: string;
  paymentApiKey: string;
  registryServiceUrl: string;
  registryApiKey: string;
  network: string;
  blockfrostApiKey: string;
}

export class ReceiptLogger {
  constructor(private config: MasumiConfig) {}

  /**
   * Log an MPP receipt to Masumi's decision logging system.
   * 
   * Creates a composite hash: SHA256(mppReceipt + inputHash + outputHash)
   * and submits it to the Masumi Payment Service for on-chain recording.
   */
  async logReceipt(entry: ReceiptLogEntry): Promise<void> {
    const compositeHash = this.createCompositeHash(entry);

    console.log(`[Receipt] Logging cross-chain receipt for job ${entry.jobId}`);
    console.log(`  MPP tx: ${entry.mppReceipt?.txHash || 'N/A'}`);
    console.log(`  Composite hash: ${compositeHash}`);
    console.log(`  Target: Cardano (${this.config.network})`);

    try {
      // Submit the hash to Masumi Payment Service
      // This gets recorded on Cardano as part of the decision log
      const res = await fetch(
        `${this.config.paymentServiceUrl}/payment/complete`,
        {
          method: 'POST',
          headers: masumiAuthHeaders(this.config.paymentApiKey),
          body: JSON.stringify({
            job_id: entry.jobId,
            agent_identifier: entry.agentId,
            output_hash: compositeHash,
            // Include the MPP settlement details as metadata
            metadata: {
              payment_protocol: 'mpp',
              settlement_chain: 'tempo',
              mpp_challenge_id: entry.mppReceipt?.challengeId,
              mpp_tx_hash: entry.mppReceipt?.txHash,
              mpp_settled_at: entry.mppReceipt?.settledAt,
            },
          }),
        }
      );

      if (!res.ok) {
        const errText = await res.text();
        console.error(`[Receipt] Masumi logging failed: ${res.status} ${errText}`);
        // Don't throw — receipt logging is best-effort
        // The payment already settled on Tempo
      } else {
        console.log(`[Receipt] Successfully logged to Cardano for job ${entry.jobId}`);
      }
    } catch (err) {
      console.error(`[Receipt] Failed to log receipt:`, err);
      // Best-effort — don't break the flow
    }
  }

  /**
   * Create a composite hash combining MPP receipt + Masumi hashes.
   * 
   * This follows Masumi's MIP-004 hashing standard adapted for
   * cross-chain receipts. The hash proves:
   *   - What was paid (MPP receipt)
   *   - What input was provided (input hash)
   *   - What output was produced (output hash)
   */
  private createCompositeHash(entry: ReceiptLogEntry): string {
    const data = JSON.stringify({
      mpp_receipt: {
        challengeId: entry.mppReceipt?.challengeId,
        txHash: entry.mppReceipt?.txHash,
        method: entry.mppReceipt?.method,
        amount: entry.mppReceipt?.amount,
        settledAt: entry.mppReceipt?.settledAt,
      },
      input_hash: entry.inputHash || '',
      output_hash: entry.outputHash || '',
      job_id: entry.jobId,
      agent_id: entry.agentId,
    }, null, 0); // Deterministic JSON (no whitespace)

    return createHash('sha256').update(data).digest('hex');
  }
}
