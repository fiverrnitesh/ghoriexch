import type {
  DepositInitInput,
  PaymentInitResult,
  PaymentProvider,
  WithdrawInitInput,
} from './payment-provider.interface.js';
import { env } from '../../config/env.js';
import { ForbiddenError } from '../../lib/errors.js';

/** Localhost sandbox — simulates deposits/withdrawals without real money */
export class SandboxPaymentProvider implements PaymentProvider {
  readonly name = 'sandbox';

  async initiateDeposit(input: DepositInitInput): Promise<PaymentInitResult> {
    if (!env.wallet.sandboxMode) {
      throw new ForbiddenError('Sandbox payment provider is disabled');
    }

    return {
      providerReference: `sandbox-dep-${input.userId.slice(0, 8)}-${Date.now()}`,
      status: 'completed',
      message: 'SANDBOX deposit — not real money',
    };
  }

  async initiateWithdrawal(input: WithdrawInitInput): Promise<PaymentInitResult> {
    if (!env.wallet.sandboxMode) {
      throw new ForbiddenError('Sandbox payment provider is disabled');
    }

    return {
      providerReference: `sandbox-wdr-${input.userId.slice(0, 8)}-${Date.now()}`,
      status: 'completed',
      message: 'SANDBOX withdrawal — not real money',
    };
  }
}

/** Production stub — returns pending until a real gateway is configured */
export class ProductionPaymentProviderStub implements PaymentProvider {
  readonly name = 'production-stub';

  async initiateDeposit(_input: DepositInitInput): Promise<PaymentInitResult> {
    return {
      providerReference: `pending-dep-${Date.now()}`,
      status: 'pending',
      message: 'Deposit pending — configure a payment gateway to complete',
    };
  }

  async initiateWithdrawal(_input: WithdrawInitInput): Promise<PaymentInitResult> {
    return {
      providerReference: `pending-wdr-${Date.now()}`,
      status: 'pending',
      message: 'Withdrawal pending — configure a payment gateway to complete',
    };
  }
}

export function getPaymentProvider(): PaymentProvider {
  return env.wallet.sandboxMode
    ? new SandboxPaymentProvider()
    : new ProductionPaymentProviderStub();
}
