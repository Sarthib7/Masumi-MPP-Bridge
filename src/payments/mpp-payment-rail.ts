import { createMppMiddleware, type MppConfig } from '../middleware/mpp-gate.js';
import type { PaymentRail } from './payment-rail.js';

/**
 * MPP is the first external payment rail plugin for the bridge.
 * Today it settles via Tempo; additional MPP settlement methods can extend this later.
 */
export function createMppPaymentRail(config: MppConfig): PaymentRail {
  const middleware = createMppMiddleware(config);

  return {
    metadata: {
      id: 'mpp',
      protocol: 'mpp',
      methods: ['tempo'],
      settlementChains: {
        payment: 'tempo',
        accountability: 'cardano',
      },
    },
    charge: middleware.charge,
  };
}
