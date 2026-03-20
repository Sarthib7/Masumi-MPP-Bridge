/**
 * MPP Payment Gate Middleware
 *
 * Wraps paid endpoints with HTTP 402 challenge-response payment.
 * Uses `mppx/server` when MPP_SECRET_KEY and MPP_RECIPIENT are set;
 * otherwise falls back to a dev stub that matches the same protocol shape.
 *
 * @see https://mpp.dev/overview
 */

import { Mppx, tempo } from 'mppx/server';

export interface MppConfig {
  currency: string;
  recipient: string;
  testnet: boolean;
  /** Required for real mppx verification (HMAC-bound challenges). */
  secretKey?: string;
  realm?: string;
  stripeEnabled?: boolean;
  stripeSecretKey?: string;
}

export interface ChargeOptions {
  amount: string;
  metadata?: Record<string, string>;
}

export type MppSuccess = {
  status: 200;
  withReceipt: (response: Response) => Response;
};

export type MppChallenge = {
  status: 402;
  challenge: Response;
  withReceipt: (response: Response) => Response;
};

export type MppResult = MppSuccess | MppChallenge;

export type MppMiddleware = {
  charge: (options: ChargeOptions) => (request: Request) => Promise<MppResult>;
};

function isConfigured(config: MppConfig): boolean {
  return Boolean(config.secretKey && config.recipient);
}

/**
 * Create the MPP middleware instance.
 */
export function createMppMiddleware(mppConfig: MppConfig): MppMiddleware {
  if (isConfigured(mppConfig)) {
    const mppx = Mppx.create({
      methods: [
        tempo({
          currency: mppConfig.currency as `0x${string}`,
          recipient: mppConfig.recipient as `0x${string}`,
          testnet: mppConfig.testnet,
        }),
      ],
      realm: mppConfig.realm ?? 'masumi-mpp-bridge',
      secretKey: mppConfig.secretKey!,
    });

    return {
      charge(options: ChargeOptions) {
        const meta = options.metadata ?? {};
        const handler = mppx.tempo.charge({
          amount: options.amount,
          meta,
        });
        return (request: Request) => handler(request) as Promise<MppResult>;
      },
    };
  }

  return createDevStub(mppConfig);
}

/** Dev / test stub when MPP_SECRET_KEY or MPP_RECIPIENT is missing. */
function createDevStub(mppConfig: MppConfig): MppMiddleware {
  return {
    charge: (options: ChargeOptions) => {
      return async (request: Request): Promise<MppResult> => {
        const authHeader = request.headers.get('Authorization');

        if (!authHeader || !authHeader.startsWith('Payment ')) {
          const challengeId = generateChallengeId();
          const challenge = {
            type: 'https://paymentauth.org/problems/payment-required',
            title: 'Payment Required',
            status: 402,
            detail:
              'Payment is required to access this resource. (dev stub — set MPP_SECRET_KEY + MPP_RECIPIENT for real mppx)',
            challengeId,
            methods: [
              {
                type: 'tempo',
                currency: mppConfig.currency,
                recipient: mppConfig.recipient || '0x0000000000000000000000000000000000000000',
                amount: options.amount,
                chainId: mppConfig.testnet ? 'tempo-testnet' : 'tempo',
              },
            ],
            ...(options.metadata && { metadata: options.metadata }),
          };

          const challengeResponse = new Response(JSON.stringify(challenge), {
            status: 402,
            headers: {
              'Content-Type': 'application/problem+json',
              'WWW-Authenticate': `Payment realm="masumi-mpp-bridge" challenge="${challengeId}"`,
            },
          });

          return {
            status: 402,
            challenge: challengeResponse,
            withReceipt: () => challengeResponse,
          };
        }

        try {
          const credential = parsePaymentCredential(authHeader);
          const verified = await verifyCredential(credential, options, mppConfig);

          if (!verified.valid) {
            const invalid = new Response(
              JSON.stringify({
                type: 'https://paymentauth.org/problems/invalid-credential',
                title: 'Invalid Payment Credential',
                status: 402,
                detail: verified.reason || 'Payment verification failed.',
              }),
              {
                status: 402,
                headers: { 'Content-Type': 'application/problem+json' },
              },
            );
            return {
              status: 402,
              challenge: invalid,
              withReceipt: (r) => r,
            };
          }

          const receipt = {
            challengeId: credential.challengeId,
            method: credential.method || 'tempo',
            status: 'settled',
            amount: options.amount,
            txHash: credential.txHash,
            settledAt: new Date().toISOString(),
          };

          return {
            status: 200,
            withReceipt: (response: Response) => {
              const newResponse = new Response(response.body, {
                status: response.status,
                headers: new Headers(response.headers),
              });
              newResponse.headers.set('Payment-Receipt', JSON.stringify(receipt));
              return newResponse;
            },
          };
        } catch (err) {
          const errRes = new Response(
            JSON.stringify({
              type: 'https://paymentauth.org/problems/payment-error',
              title: 'Payment Error',
              status: 402,
              detail: err instanceof Error ? err.message : 'Unknown payment error',
            }),
            {
              status: 402,
              headers: { 'Content-Type': 'application/problem+json' },
            },
          );
          return {
            status: 402,
            challenge: errRes,
            withReceipt: (r) => r,
          };
        }
      };
    },
  };
}

function generateChallengeId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function parsePaymentCredential(authHeader: string): any {
  const credentialStr = authHeader.replace('Payment ', '');
  try {
    return JSON.parse(Buffer.from(credentialStr, 'base64').toString());
  } catch {
    return JSON.parse(credentialStr);
  }
}

async function verifyCredential(
  credential: any,
  _options: ChargeOptions,
  _config: MppConfig,
): Promise<{ valid: boolean; reason?: string }> {
  if (!credential.challengeId) {
    return { valid: false, reason: 'Missing challengeId' };
  }
  if (!credential.txHash && !credential.signature) {
    return { valid: false, reason: 'Missing transaction proof' };
  }
  return { valid: true };
}
