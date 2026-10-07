import { AccountContract, type InvocationArgs } from '@ancore/account-abstraction';
import type { Network } from '@ancore/types';
import { StrKey } from '@stellar/stellar-sdk';

import { addSessionKey, type AddSessionKeyParams, type SessionKeyWriter } from './add-session-key';
import {
  createWallet as createWalletOrchestration,
  type CreateWalletParams,
  type CreateWalletResult,
} from './create-wallet';
import { BuilderValidationError } from './errors';
import {
  refreshSessionKeyTtl,
  type RefreshSessionKeyTtlOptions,
  type RefreshSessionKeyTtlParams,
  type RefreshSessionKeyTtlResult,
  type SessionKeyTtlRefresher,
} from './refresh-session-key-ttl';
import { withNetworkRetry, type RetryPolicyOptions } from './retry-policy';
import type { RetryPresetName } from './retry-presets';
import {
  revokeSessionKey,
  type RevokeSessionKeyParams,
  type SessionKeyRevoker,
} from './revoke-session-key';
import { deriveContractId } from './wallet';

import { withRetry, type RetryOptions } from './utils/retry';

import { withRetry, type RetryOptions } from './utils/retry';

export interface AncoreClientOptions {
  accountContractId: string;
  /**
   * Default retry policy or preset name applied to client network calls.
   * Can be overridden per method call.
   */
  retry?: RetryPolicyOptions | RetryPresetName;
   * Default retry configuration for network and RPC calls.
   */
  retryOptions?: RetryOptions;
}

export class AncoreClient {
  readonly accountContractId: string;
  private readonly accountContract: SessionKeyWriter & SessionKeyRevoker & SessionKeyTtlRefresher;
  private readonly defaultRetry?: RetryPolicyOptions | RetryPresetName;
  private readonly retryOptions?: RetryOptions;

  constructor(options: AncoreClientOptions) {
    if (!options.accountContractId) {
      throw new BuilderValidationError(
        'accountContractId is required. Provide the C... contract ID of your deployed Ancore account contract.'
      );
    }

    this.accountContractId = options.accountContractId;
    this.accountContract = new AccountContract(options.accountContractId);
    this.defaultRetry = options.retry;
  }

  /**
   * Returns the globally configured retry policy or preset name for this client instance.
   */
  getRetryPolicy(): RetryPolicyOptions | RetryPresetName | undefined {
    return this.defaultRetry;
  }

  /**
   * Wraps an arbitrary asynchronous network operation (e.g. Soroban RPC / Horizon calls)
   * with the client's configured retry policy or an explicit method-level override.
   *
   * @param fn - The async function to execute
   * @param override - Optional method-level retry policy or preset override
   * @returns The resolved value of `fn`
   *
   * @example
   * ```typescript
   * const client = new AncoreClient({ accountContractId: 'C...', retry: 'RELIABLE' });
   * const account = await client.withRetry(() => server.getAccount(accountId));
   * ```
   */
  withRetry<T>(
    fn: () => Promise<T>,
    override?: RetryPolicyOptions | RetryPresetName
  ): Promise<T> {
    const policy = override ?? this.defaultRetry;
    return withNetworkRetry(fn, policy);
    this.retryOptions = options.retryOptions;
  }

  /**
   * Execute an asynchronous network call with the client's configured retry policy.
   *
   * @param fn Function to execute
   * @param overrideOptions Optional override for this specific invocation
   */
  withRetry<T>(fn: () => Promise<T>, overrideOptions?: RetryOptions): Promise<T> {
    return withRetry(fn, {
      ...this.retryOptions,
      ...overrideOptions,
    });
  }

  /**
   * Creates a new Ancore wallet by generating a fresh BIP39 mnemonic, deriving
   * an Ed25519 keypair via BIP-44 HD derivation, and optionally encrypting the
   * mnemonic with the provided password.
   *
   * @example
   * ```typescript
   * const client = new AncoreClient({ accountContractId: 'C...' });
   * const wallet = await client.createWallet({ password: 'hunter2' });
   * // wallet.publicKey  → G…  (safe to persist)
   * // wallet.contractId → C…  (safe to persist)
   * // wallet.encryptedMnemonic → persist this; do NOT persist wallet.secretKey
   * ```
   */
  createWallet(params?: CreateWalletParams): Promise<CreateWalletResult> {
    return createWalletOrchestration(params);
  }

  addSessionKey(params: AddSessionKeyParams): InvocationArgs {
    return addSessionKey(this.accountContract, params);
  }

  revokeSessionKey(params: RevokeSessionKeyParams): InvocationArgs {
    return revokeSessionKey(this.accountContract, params);
  }

  /* eslint-disable no-redeclare -- TypeScript function overload signatures */
  refreshSessionKeyTtl(
    params: RefreshSessionKeyTtlParams
  ): InvocationArgs;
  refreshSessionKeyTtl(
    params: RefreshSessionKeyTtlParams,
    options: RefreshSessionKeyTtlOptions
  ): Promise<RefreshSessionKeyTtlResult>;
  refreshSessionKeyTtl(
    params: RefreshSessionKeyTtlParams,
    options?: RefreshSessionKeyTtlOptions
  ): InvocationArgs | Promise<RefreshSessionKeyTtlResult> {
    /* eslint-enable no-redeclare */
    if (!options) {
      return refreshSessionKeyTtl(this.accountContract, params);
    }

    const mergedOptions: RefreshSessionKeyTtlOptions = {
      ...options,
      retry: options.retry ?? this.defaultRetry,
      retryOptions: {
        ...this.retryOptions,
        ...options.retryOptions,
      },
    };

    return refreshSessionKeyTtl(this.accountContract, params, mergedOptions);
  }
}

/**
 * Convenience factory to create an initialized AncoreClient instance for a smart account.
 * Automatically looks up or derives the deterministic contract ID from the owner's public key.
 *
 * @param publicKey Owner's Stellar public key (G...) or contract ID (C...)
 * @param options Optional network and client configuration
 */
export function createSmartAccount(
  publicKey: string,
  options?: CreateSmartAccountClientOptions
): AncoreClient {
  return AncoreClient.createSmartAccount(publicKey, options);
}
