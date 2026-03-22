import type { Hono } from 'hono';
import type { IAgentCatalog } from '../catalog/agent-catalog-types.js';
import type { Config } from '../config.js';
import { logger } from '../lib/logger.js';
import { adaOracleParams, resolveMppChargeUsd } from '../lib/pricing.js';
import { derivePurchaserId, hashOutput } from '../lib/purchaser-id.js';
import { getBridgeVersion } from '../lib/version.js';
import type { ReceiptLogger } from '../logging/receipt-logger.js';
import type { PaymentRail } from '../payments/payment-rail.js';
import { createMip003Proxy, type StartJobRequest } from '../proxy/mip003-proxy.js';
import type { SessionJobManager } from '../sessions/session-job-manager.js';

export type Mip003Proxy = ReturnType<typeof createMip003Proxy>;

export interface HttpRouteDeps {
  catalog: IAgentCatalog;
  sessionManager: SessionJobManager;
  receiptLogger: ReceiptLogger;
  mip003Proxy: Mip003Proxy;
  paymentRail: PaymentRail;
  config: Config;
}

export function registerHttpRoutes(app: Hono, deps: HttpRouteDeps): void {
  const { catalog, sessionManager, receiptLogger, mip003Proxy, paymentRail, config } = deps;

  app.get('/health', (c) =>
    c.json({
      ok: true,
      service: 'masumi-mpp-bridge',
      version: getBridgeVersion(),
    }),
  );

  app.get('/agents', async (c) => {
    try {
      const agents = await catalog.listAgents();
      const oracle = adaOracleParams(config.bridge);
      const rows = await Promise.all(
        agents.map(async (a) => ({
          id: a.agentIdentifier,
          name: a.name,
          description: a.description,
          pricing: {
            amount: a.pricingQuantity,
            unit: a.pricingUnit,
            usd_estimate: await resolveMppChargeUsd(a, oracle, config.bridge.minChargeUsd),
          },
          capabilities: a.capabilities,
          hire_url: `/agents/${a.agentIdentifier}/start_job`,
        })),
      );
      return c.json({
        status: 'success',
        bridge: 'masumi-mpp-bridge',
        payment_protocols: [paymentRail.metadata.protocol],
        payment_methods: paymentRail.metadata.methods,
        agents: rows,
      });
    } catch (err) {
      logger.error('GET /agents failed:', err);
      return c.json({ status: 'error', message: 'Failed to fetch agents' }, 500);
    }
  });

  app.get('/agents/:agentId/availability', async (c) => {
    const agentId = c.req.param('agentId');
    const agent = await catalog.getAgent(agentId);
    if (!agent) return c.json({ status: 'error', message: 'Agent not found' }, 404);
    if (!agent.apiBaseUrl) {
      return c.json(
        { status: 'error', message: 'Agent has no MIP-003 base URL in catalog' },
        502,
      );
    }
    const result = await mip003Proxy.availability(agent.apiBaseUrl);
    return c.json(result);
  });

  app.get('/agents/:agentId/input_schema', async (c) => {
    const agentId = c.req.param('agentId');
    const agent = await catalog.getAgent(agentId);
    if (!agent) return c.json({ status: 'error', message: 'Agent not found' }, 404);
    if (!agent.apiBaseUrl) {
      return c.json(
        { status: 'error', message: 'Agent has no MIP-003 base URL in catalog' },
        502,
      );
    }
    const result = await mip003Proxy.inputSchema(agent.apiBaseUrl);
    return c.json(result);
  });

  app.get('/agents/:agentId/status/:jobId', async (c) => {
    const agentId = c.req.param('agentId');
    const jobId = c.req.param('jobId');
    const agent = await catalog.getAgent(agentId);
    if (!agent) return c.json({ status: 'error', message: 'Agent not found' }, 404);
    if (!agent.apiBaseUrl) {
      return c.json(
        { status: 'error', message: 'Agent has no MIP-003 base URL in catalog' },
        502,
      );
    }

    const result = await mip003Proxy.status(agent.apiBaseUrl, jobId);

    if (result.status === 'completed' && config.bridge.receiptLogging) {
      const session = sessionManager.getSessionForJob(jobId);
      if (session && !session.receiptLogged) {
        try {
          await receiptLogger.logReceipt({
            jobId,
            agentId,
            mppReceipt: session.mppReceipt,
            inputHash: session.inputHash,
            outputHash: result.output
              ? hashOutput(result.output, session.purchaserId)
              : null,
          });
          sessionManager.markReceiptLogged(jobId);
        } catch (err) {
          logger.error('Receipt logging failed:', err);
        }
      }
    }

    return c.json(result);
  });

  app.post('/agents/:agentId/start_job', async (c) => {
    const agentId = c.req.param('agentId');
    const agent = await catalog.getAgent(agentId);
    if (!agent) return c.json({ status: 'error', message: 'Agent not found' }, 404);
    if (!agent.apiBaseUrl) {
      return c.json(
        { status: 'error', message: 'Agent has no MIP-003 base URL in catalog' },
        502,
      );
    }

    const bodyText = await c.req.text();
    let body: Record<string, unknown> = {};
    try {
      body = bodyText ? (JSON.parse(bodyText) as Record<string, unknown>) : {};
    } catch {
      return c.json({ status: 'error', message: 'Invalid JSON body' }, 400);
    }

    const nativePurchaser = body.identifier_from_purchaser;
    if (typeof nativePurchaser === 'string' && nativePurchaser.length > 0) {
      try {
        const masumiResult = await mip003Proxy.startJob(agent.apiBaseUrl, {
          identifier_from_purchaser: nativePurchaser,
          input_data: (body.input_data ?? {}) as StartJobRequest['input_data'],
        });
        return c.json({
          status: 'success',
          job_id: masumiResult.job_id,
          agent_id: agentId,
          payment: { method: 'masumi_native', settled_on: 'cardano' },
          pay_by_time: masumiResult.payByTime,
          submit_result_time: masumiResult.submitResultTime,
          status_url: `/agents/${agentId}/status/${masumiResult.job_id}`,
        });
      } catch (err) {
        logger.error('Job creation failed (Masumi native):', err);
        return c.json(
          {
            status: 'error',
            message: 'Failed to create job on Masumi agent',
            detail: err instanceof Error ? err.message : 'Unknown error',
          },
          502,
        );
      }
    }

    const oracle = adaOracleParams(config.bridge);
    const usdAmount = await resolveMppChargeUsd(
      agent,
      oracle,
      config.bridge.minChargeUsd,
    );
    const mppRequest = new Request(c.req.url, {
      method: 'POST',
      headers: c.req.raw.headers,
      body: bodyText,
    });

    const mppResult = await paymentRail.charge({
      amount: usdAmount.toString(),
      metadata: {
        agent_id: agentId,
        service: 'masumi-mpp-bridge',
      },
    })(mppRequest);

    if (mppResult.status === 402) {
      return mppResult.challenge;
    }

    try {
      const purchaserId = derivePurchaserId(mppRequest, agentId);
      const masumiResult = await mip003Proxy.startJob(agent.apiBaseUrl, {
        identifier_from_purchaser: purchaserId,
        input_data: (body.input_data ?? {}) as StartJobRequest['input_data'],
      });

      const inner = Response.json({
        status: 'success',
        job_id: masumiResult.job_id,
        agent_id: agentId,
        payment: {
          method: 'mpp',
          settled_on: 'tempo',
          amount: usdAmount,
          currency: 'USD',
        },
        pay_by_time: masumiResult.payByTime,
        submit_result_time: masumiResult.submitResultTime,
        status_url: `/agents/${agentId}/status/${masumiResult.job_id}`,
      });

      const finalResponse = mppResult.withReceipt(inner);
      const receiptHdr = finalResponse.headers.get('Payment-Receipt');
      const mppReceipt = receiptHdr ? JSON.parse(receiptHdr) : {};

      if (masumiResult.job_id) {
        sessionManager.createMapping({
          jobId: masumiResult.job_id,
          agentId,
          mppReceipt,
          purchaserId,
          inputHash: masumiResult.input_hash,
          paidAmount: usdAmount,
          paidCurrency: 'USD',
          settledOn: 'tempo',
        });
      }

      return finalResponse;
    } catch (err) {
      logger.error('Job creation failed:', err);
      return c.json(
        {
          status: 'error',
          message: 'Failed to create job on Masumi agent',
          detail: err instanceof Error ? err.message : 'Unknown error',
        },
        502,
      );
    }
  });

  app.post('/agents/:agentId/provide_input/:jobId', async (c) => {
    const agentId = c.req.param('agentId');
    const jobId = c.req.param('jobId');
    const agent = await catalog.getAgent(agentId);
    if (!agent) return c.json({ status: 'error', message: 'Agent not found' }, 404);
    if (!agent.apiBaseUrl) {
      return c.json(
        { status: 'error', message: 'Agent has no MIP-003 base URL in catalog' },
        502,
      );
    }

    const incrementalCharge = '0.001';
    const bodyText = await c.req.text();
    const mppRequest = new Request(c.req.url, {
      method: 'POST',
      headers: c.req.raw.headers,
      body: bodyText,
    });

    const mppResult = await paymentRail.charge({
      amount: incrementalCharge,
    })(mppRequest);

    if (mppResult.status === 402) {
      return mppResult.challenge;
    }

    let body: unknown = {};
    try {
      body = bodyText ? JSON.parse(bodyText) : {};
    } catch {
      return c.json({ status: 'error', message: 'Invalid JSON body' }, 400);
    }
    const result = await mip003Proxy.provideInput(agent.apiBaseUrl, jobId, body);

    return mppResult.withReceipt(Response.json(result));
  });

  const version = getBridgeVersion();
  app.get('/', (c) =>
    c.json({
      name: 'Masumi MPP Bridge',
      version,
      description:
        'Masumi payment-rail bridge. Current external rail: MPP, with Tempo settlement today and more rails planned.',
      client_requirements: {
        bridge_url: 'this host (public HTTPS)',
        mpp_wallet: 'required for paid routes',
        masumi_or_marketplace_api_keys: 'not required',
        clone_bridge_repository: 'not required',
        bridge_env_file: 'not used by clients; operator-only on server',
      },
      protocol: 'MIP-003',
      payment_protocols: [paymentRail.metadata.protocol],
      payment_methods: paymentRail.metadata.methods,
      settlement_chains: paymentRail.metadata.settlementChains,
      endpoints: {
        health: 'GET /health',
        list_agents: 'GET /agents',
        agent_availability: 'GET /agents/:id/availability',
        agent_schema: 'GET /agents/:id/input_schema',
        hire_agent: 'POST /agents/:id/start_job (MPP payment required)',
        job_status: 'GET /agents/:id/status/:jobId',
        provide_input: 'POST /agents/:id/provide_input/:jobId (MPP payment required)',
      },
      agent_instructions: `You can hire Masumi-network agents through this bridge without cloning any bridge repo, without a bridge .env file, and without Masumi or marketplace API keys — only this URL and MPP (e.g. Tempo via mppx).
Use GET /agents to discover agents. GET /agents/:id/input_schema for input format.
POST /agents/:id/start_job: HTTP 402 then pay with MPP; mppx handles signing and retry.
Poll GET /agents/:id/status/:jobId until status is "completed" for results.`,
    }),
  );
}
