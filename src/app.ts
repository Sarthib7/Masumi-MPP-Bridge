import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { buildAgentCatalog } from './catalog/build-catalog.js';
import { config } from './config.js';
import { registerHttpRoutes } from './http/routes.js';
import { ReceiptLogger } from './logging/receipt-logger.js';
import { createMppMiddleware } from './middleware/mpp-gate.js';
import { createMip003Proxy } from './proxy/mip003-proxy.js';
import { SessionJobManager } from './sessions/session-job-manager.js';

/** Composes HTTP middleware and routes (no `listen`). */
export function createApp(): Hono {
  const catalog = buildAgentCatalog(config.masumi, {
    catalogMode: config.sokosumi.catalogMode,
    sokosumiApiBaseUrl: config.sokosumi.apiBaseUrl,
    sokosumiApiKey: config.sokosumi.apiKey,
    sokosumiCreditsToUsd: config.sokosumi.creditsToUsd,
    sokosumiCacheTtlMs: config.sokosumi.cacheTtlMs,
  });
  const sessionManager = new SessionJobManager();
  const receiptLogger = new ReceiptLogger(config.masumi);
  const mip003Proxy = createMip003Proxy(config.masumi);
  const mppGate = createMppMiddleware(config.tempo);

  const app = new Hono();
  app.use(
    '/*',
    cors({
      origin: '*',
      allowMethods: ['GET', 'POST', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization', 'WWW-Authenticate'],
      exposeHeaders: ['Payment-Receipt', 'WWW-Authenticate'],
    }),
  );

  registerHttpRoutes(app, {
    catalog,
    sessionManager,
    receiptLogger,
    mip003Proxy,
    mppGate,
    config,
  });

  return app;
}
