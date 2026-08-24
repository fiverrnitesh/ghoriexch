/** Payment gateway provider interface — plug in Stripe, Razorpay, etc. later */

export interface DepositInitInput {
  userId: string;
  amount: number;
  currency: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}

export interface WithdrawInitInput {
  userId: string;
  amount: number;
  currency: string;
  destination?: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}

export interface PaymentInitResult {
  providerReference: string;
  status: 'pending' | 'completed' | 'failed';
  message?: string;
}

export interface PaymentProvider {
  readonly name: string;
  initiateDeposit(input: DepositInitInput): Promise<PaymentInitResult>;
  initiateWithdrawal(input: WithdrawInitInput): Promise<PaymentInitResult>;
  confirmDeposit?(providerReference: string): Promise<boolean>;
}
