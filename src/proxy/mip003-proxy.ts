import { masumiAuthHeaders } from '../masumi-http.js';

/**
 * MIP-003 Proxy
 * 
 * Forwards requests to Masumi agentic services following the
 * MIP-003: Agentic Service API Standard.
 * 
 * Required MIP-003 endpoints on the target agent:
 *   GET  /availability        - Health check
 *   GET  /input_schema        - Expected input format
 *   POST /start_job           - Create a new job
 *   GET  /status/:job_id      - Poll job status
 *   POST /provide_input/:job_id - Send additional input
 */

export interface MasumiConfig {
  paymentServiceUrl: string;
  paymentApiKey: string;
  registryServiceUrl: string;
  registryApiKey: string;
  network: string;
  blockfrostApiKey: string;
}

export interface StartJobRequest {
  identifier_from_purchaser: string;
  input_data: Record<string, any> | Array<{ key: string; value: string }>;
}

export interface StartJobResponse {
  job_id: string;
  blockchainIdentifier?: string;
  payByTime?: number;
  submitResultTime?: number;
  unlockTime?: number;
  externalDisputeUnlockTime?: number;
  agentIdentifier?: string;
  sellerVKey?: string;
  identifierFromPurchaser?: string;
  amounts?: Array<{ amount: string; unit: string }>;
  input_hash?: string;
}

export interface JobStatusResponse {
  job_id: string;
  status: 'pending' | 'awaiting_payment' | 'running' | 'completed' | 'failed';
  output?: any;
  error?: string;
}

const STATUS_VALUES: JobStatusResponse['status'][] = [
  'pending',
  'awaiting_payment',
  'running',
  'completed',
  'failed',
];

function normalizeStatus(data: unknown, fallbackJobId: string): JobStatusResponse {
  if (!data || typeof data !== 'object') {
    return { job_id: fallbackJobId, status: 'pending' };
  }
  const d = data as Record<string, unknown>;
  const raw = d.status ?? d.job_status;
  const job_id = String(d.job_id ?? d.jobId ?? fallbackJobId);
  let status: JobStatusResponse['status'] = 'pending';
  if (typeof raw === 'string') {
    const s = raw.toLowerCase() as JobStatusResponse['status'];
    if (STATUS_VALUES.includes(s)) status = s;
  }
  return {
    job_id,
    status,
    output: d.output ?? d.result,
    error: d.error !== undefined ? String(d.error) : undefined,
  };
}

export function createMip003Proxy(config: MasumiConfig) {
  const headers = {
    'Content-Type': 'application/json',
  };

  return {
    /**
     * GET /availability
     * Check if the agentic service is operational
     */
    async availability(agentBaseUrl: string): Promise<any> {
      const res = await fetch(`${agentBaseUrl}/availability`, { headers });
      if (!res.ok) {
        return { status: 'unavailable', error: `Agent returned ${res.status}` };
      }
      return res.json();
    },

    /**
     * GET /input_schema
     * Get the expected input format for /start_job
     */
    async inputSchema(agentBaseUrl: string): Promise<any> {
      const res = await fetch(`${agentBaseUrl}/input_schema`, { headers });
      if (!res.ok) {
        throw new Error(`Failed to get input schema: ${res.status}`);
      }
      return res.json();
    },

    /**
     * POST /start_job
     * Create a new job on the Masumi agent.
     * 
     * IMPORTANT: In the bridge flow, payment has ALREADY been collected
     * via MPP. So we either:
     *   a) Skip Masumi escrow entirely (MPP is the payment rail)
     *   b) Create a payment request on Masumi too (dual settlement)
     * 
     * We go with option (a) by default — the bridge handles payment,
     * the agent just does the work. The agent still gets the standard
     * MIP-003 request format.
     */
    async startJob(
      agentBaseUrl: string,
      request: StartJobRequest
    ): Promise<StartJobResponse> {
      const res = await fetch(`${agentBaseUrl}/start_job`, {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
      });

      if (!res.ok) {
        const error = await res.text();
        throw new Error(`Agent /start_job failed (${res.status}): ${error}`);
      }

      return res.json();
    },

    /**
     * GET /status/:job_id
     * Poll job status
     */
    async status(
      agentBaseUrl: string,
      jobId: string
    ): Promise<JobStatusResponse> {
      const base = agentBaseUrl.replace(/\/$/, '');
      const paths = [
        `${base}/status/${encodeURIComponent(jobId)}`,
        `${base}/status?jobId=${encodeURIComponent(jobId)}`,
        `${base}/status?job_id=${encodeURIComponent(jobId)}`,
      ];
      let lastErr: Error | undefined;
      for (const url of paths) {
        const res = await fetch(url, { headers });
        if (res.ok) {
          const data = await res.json();
          return normalizeStatus(data, jobId);
        }
        lastErr = new Error(`Agent /status failed: ${res.status}`);
      }
      throw lastErr ?? new Error('Agent /status failed');
    },

    /**
     * POST /provide_input/:job_id
     * Send additional input to a running job
     */
    async provideInput(
      agentBaseUrl: string,
      jobId: string,
      input: any
    ): Promise<any> {
      const res = await fetch(`${agentBaseUrl}/provide_input/${jobId}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        throw new Error(`Agent /provide_input failed: ${res.status}`);
      }
      return res.json();
    },

    /**
     * Create a payment request on Masumi Payment Service.
     * Used when dual-settlement mode is enabled (settle on BOTH
     * Tempo via MPP AND Cardano via Masumi escrow).
     * 
     * In most cases, you DON'T need this — MPP handles payment.
     * But it's here for the dual-mode scenario.
     */
    async createMasumiPaymentRequest(
      agentIdentifier: string,
      purchaserIdentifier: string,
      inputData: any
    ): Promise<any> {
      const res = await fetch(`${config.paymentServiceUrl}/payment/`, {
        method: 'POST',
        headers: {
          ...headers,
          ...masumiAuthHeaders(config.paymentApiKey),
        },
        body: JSON.stringify({
          agent_identifier: agentIdentifier,
          identifier_from_purchaser: purchaserIdentifier,
          input_data: inputData,
          network: config.network,
        }),
      });
      if (!res.ok) {
        throw new Error(`Masumi payment request failed: ${res.status}`);
      }
      return res.json();
    },
  };
}
