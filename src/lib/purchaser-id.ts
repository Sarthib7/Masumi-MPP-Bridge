import { createHash } from 'node:crypto';

/**
 * MIP-003 expects a 26-character hex `identifier_from_purchaser`.
 * Stable id from verified payment request (Authorization + agent).
 */
export function derivePurchaserId(request: Request, agentId: string): string {
  const auth = request.headers.get('Authorization') ?? '';
  return createHash('sha256').update(`${auth}:${agentId}`).digest('hex').slice(0, 26);
}

export function hashOutput(output: unknown, purchaserId: string): string {
  const data = JSON.stringify(output) + purchaserId;
  return createHash('sha256').update(data).digest('hex');
}
