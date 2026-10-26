import { useMemo } from 'react';
import { useProtocol } from '@tetherto/wdk-react-native-core';
import { lifiProtocolName } from '@/wdk/networks';
import type { SwapToken } from './tokens';
import type { SwapProvider, SwapQuote, SwapRequest, SwapResult, SwapStatus } from './types';

/**
 * The methods of `@lifi/wdk-protocol-swidge-lifi` that the app calls. They are
 * allow-listed in `wdk.config.js` under `allowedMethods`.
 */
interface LifiSwidge {
  quoteSwidge(route: LifiRoute): Promise<LifiQuote>;
  swidge(route: LifiRoute & { minAmountOut?: bigint }, config?: LifiExecuteConfig): Promise<LifiExecution>;
  getSwidgeStatus(id: string, options?: { fromChain?: string; toChain?: string }): Promise<{ status: string }>;
}

interface LifiRoute {
  fromToken: string;
  toToken: string;
  toChain?: string;
  fromTokenAmount: bigint;
  slippage: number;
}

interface LifiQuote {
  toTokenAmount: string | bigint;
  toTokenAmountMin: string | bigint;
}

interface LifiExecution {
  id: string;
  hash: string | null;
}

interface LifiExecuteConfig {
  maxNetworkFeeBps?: number;
  maxProtocolFeeBps?: number;
}

/** Fee caps applied to every execution, in basis points. */
const EXECUTE_CONFIG: LifiExecuteConfig = { maxNetworkFeeBps: 500, maxProtocolFeeBps: 100 };

/** LI.FI identifies a chain's native token with the zero address. */
const LIFI_NATIVE_ADDRESS = '0x0000000000000000000000000000000000000000';

function tokenAddress(token: SwapToken): string {
  return token.address ?? LIFI_NATIVE_ADDRESS;
}

function toRoute(request: SwapRequest): LifiRoute {
  const sameChain = request.from.network === request.to.network;
  return {
    fromToken: tokenAddress(request.from),
    toToken: tokenAddress(request.to),
    ...(sameChain ? {} : { toChain: request.to.network }),
    fromTokenAmount: BigInt(request.fromAmountBase),
    slippage: request.slippage,
  };
}

/**
 * Builds the LI.FI provider for a source network. The protocol is bound to the
 * account on that network, so quoting and execution happen from the source
 * chain.
 */
export function useLifiProvider(network: string, accountIndex: number): SwapProvider {
  const lifi = useProtocol<LifiSwidge>({
    accountIndex,
    network,
    protocolType: 'swidge',
    protocolName: lifiProtocolName(network),
  });

  return useMemo<SwapProvider>(
    () => ({
      id: 'lifi',
      label: 'LI.FI',

      async quote(request) {
        const route = toRoute(request);
        const quote = await lifi.quoteSwidge(route);
        if (!quote) throw new Error('LI.FI quote unavailable. Check the wallet and network.');
        return {
          provider: 'lifi',
          request,
          toAmount: String(quote.toTokenAmount),
          toAmountMin: String(quote.toTokenAmountMin),
          raw: quote,
        } satisfies SwapQuote;
      },

      async execute(quote) {
        const route = toRoute(quote.request);
        // Re-quote right before submitting. The displayed quote goes stale, and LI.FI
        // rejects execution when the live output is below the old minimum. The fresh
        // minimum still applies the same slippage as the request.
        const fresh = await lifi.quoteSwidge(route);
        if (!fresh) throw new Error('LI.FI quote unavailable. Check the wallet and network.');
        const result = await lifi.swidge(
          { ...route, minAmountOut: BigInt(fresh.toTokenAmountMin) },
          EXECUTE_CONFIG,
        );
        if (!result) throw new Error('LI.FI swap could not be submitted.');
        return { provider: 'lifi', operationId: result.id, hash: result.hash } satisfies SwapResult;
      },

      async status(result, request) {
        const sameChain = request.from.network === request.to.network;
        const status = await lifi.getSwidgeStatus(result.operationId, {
          fromChain: request.from.network,
          ...(sameChain ? {} : { toChain: request.to.network }),
        });
        return mapStatus(status?.status);
      },
    }),
    [lifi],
  );
}

/** The module already maps LI.FI statuses to these values; anything else is unknown. */
function mapStatus(status: string | undefined): SwapStatus {
  switch (status) {
    case 'pending':
    case 'completed':
    case 'partial':
    case 'refunded':
    case 'refund-pending':
    case 'failed':
    case 'expired':
    case 'cancelled':
    case 'action-required':
      return status;
    default:
      return 'unknown';
  }
}
