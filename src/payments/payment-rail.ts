export interface ChargeOptions {
  amount: string;
  metadata?: Record<string, string>;
}

export type PaymentRailSuccess = {
  status: 200;
  withReceipt: (response: Response) => Response;
};

export type PaymentRailChallenge = {
  status: 402;
  challenge: Response;
  withReceipt: (response: Response) => Response;
};

export type PaymentRailChargeResult = PaymentRailSuccess | PaymentRailChallenge;

export interface PaymentRailMetadata {
  id: string;
  protocol: string;
  methods: string[];
  settlementChains: {
    payment: string;
    accountability?: string;
  };
}

export interface PaymentRail {
  metadata: PaymentRailMetadata;
  charge: (
    options: ChargeOptions,
  ) => (request: Request) => Promise<PaymentRailChargeResult>;
}
