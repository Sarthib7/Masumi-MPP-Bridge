/**
 * Masumi MPP Bridge — process entry.
 * Application composition lives in `app.ts`; HTTP handlers in `http/routes.ts`.
 */
import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { config } from './config.js';
import { logger } from './lib/logger.js';
import { getBridgeVersion } from './lib/version.js';

export { createApp } from './app.js';

const app = createApp();
const port = config.bridge.port;

if (!config.masumi.paymentApiKey) {
  logger.warn('PAYMENT_API_KEY is empty — registry calls will fail until configured.');
}

if (config.tempo.stripeEnabled) {
  logger.warn(
    'STRIPE_ENABLED is set, but Stripe settlement is not implemented yet. The active external rail is still MPP over Tempo.',
  );
}

const server = serve({ fetch: app.fetch, port }, (addr) => {
  const bound =
    addr && typeof addr === 'object' && 'port' in addr ? addr.port : port;
  logger.info(
    `Masumi MPP Bridge v${getBridgeVersion()} listening on port ${bound} (GET /health)`,
  );
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    logger.error(
      `Port ${port} is already in use (another bridge or app). Stop that process, or set PORT= in your .env to use a free port.`,
    );
  } else {
    logger.error('Server failed to start:', err);
  }
  process.exit(1);
});

export default { port, fetch: app.fetch };
