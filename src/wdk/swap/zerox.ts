import { useMemo } from 'react';
import { useProtocol } from '@tetherto/wdk-react-native-core';
import { zeroExProtocolName } from '@/wdk/networks';
import type { SwapToken } from './tokens';
import type { SwapProvider, SwapQuote, SwapRequest, SwapResult, SwapStatus } from './types';

/**
 * The methods of `@0x/wdk-protocol-swidge-0x` that the app calls. They are
 * allow-listed in `wdk.config.js` under `allowedMethods`.
 */
interface ZeroExSwidge {
  quoteSwidge(options: ZeroExOptions): Promise<ZeroExQuote>;
  swidge(options: ZeroExOptions): Promise<ZeroExExecution>;
  getSwidgeStatus(id: string): Promise<{ status: string }>;
}

interface ZeroExOptions {
  fromToken: string;
  toToken: string;
  fromTokenAmount: bigint;
}

interface ZeroExQuote {
  toTokenAmount: string | bigint;
  toTokenAmountMin: string | bigint;
}

interface ZeroExExecution {
  id: string;
  hash: string | null;
}

/** 0x's sentinel address for a chain's native token. */
const ZERO_EX_NATIVE_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

function tokenAddress(token: SwapToken): string {
  return token.address ?? ZERO_EX_NATIVE_ADDRESS;
}

function toOptions(from: SwapToken, to: SwapToken, fromAmountBase: string): ZeroExOptions {
  return {
    fromToken: tokenAddress(from),
    toToken: tokenAddress(to),
    fromTokenAmount: BigInt(fromAmountBase),
  };
}

/**
 * Builds the 0x provider for a source network. 0x swaps on one chain only, so
 * the protocol is bound to the account on the source network and rejects
 * cross-chain routes.
 */
export function useZeroExProvider(network: string, accountIndex: number): SwapProvider {
  const zeroEx = useProtocol<ZeroExSwidge>({
    accountIndex,
    network,
    protocolType: 'swidge',
    protocolName: zeroExProtocolName(network),
  });

  return useMemo<SwapProvider>(
    () => ({
      id: 'zerox',
      label: '0x',

      async quote(request: SwapRequest) {
        if (request.from.network !== request.to.network) {
          throw new Error('0x only swaps on one chain.');
        }
        const quote = await zeroEx.quoteSwidge(toOptions(request.from, request.to, request.fromAmountBase));
        if (!quote) throw new Error('0x quote unavailable. Check the wallet and network.');
        return {
          provider: 'zerox',
          request,
          toAmount: String(quote.toTokenAmount),
          toAmountMin: String(quote.toTokenAmountMin),
          raw: quote,
        } satisfies SwapQuote;
      },

      async execute(quote: SwapQuote) {
        const { request } = quote;
        const result = await zeroEx.swidge(toOptions(request.from, request.to, request.fromAmountBase));
        if (!result) throw new Error('0x swap could not be submitted.');
        return { provider: 'zerox', operationId: result.id, hash: result.hash } satisfies SwapResult;
      },

      async status(result: SwapResult) {
        const status = await zeroEx.getSwidgeStatus(result.operationId);
        return mapStatus(status?.status);
      },
    }),
    [zeroEx],
  );
}

function mapStatus(status: string | undefined): SwapStatus {
  switch (status) {
    case 'pending':
    case 'completed':
    case 'failed':
      return status;
    default:
      return 'unknown';
  }
}
