import { useMemo } from 'react';
import { useProtocol } from '@tetherto/wdk-react-native-core';
import { EVM_CHAIN_IDS, symbiosisProtocolName } from '@/wdk/networks';
import type { SwapToken } from './tokens';
import type { SwapProvider, SwapQuote, SwapRequest, SwapResult, SwapStatus } from './types';

/**
 * The methods of `@symbiosis-finance/wdk-protocol-swidge-symbiosis` that the app
 * calls. They are allow-listed in `wdk.config.js` under `allowedMethods`.
 */
interface SymbiosisSwidge {
  quoteSwidge(options: SymbiosisOptions): Promise<SymbiosisQuote>;
  swidge(options: SymbiosisOptions): Promise<SymbiosisExecution>;
  getSwidgeStatus(id: string): Promise<{ status: string }>;
}

interface SymbiosisOptions {
  fromToken: string;
  toToken: string;
  toChain: number;
  fromTokenAmount: bigint;
  slippage: number;
}

interface SymbiosisQuote {
  toTokenAmount: string | bigint;
  toTokenAmountMin: string | bigint;
}

interface SymbiosisExecution {
  id: string;
  hash: string | null;
}

function toOptions(from: SwapToken, to: SwapToken, fromAmountBase: string, slippage: number): SymbiosisOptions {
  return {
    fromToken: from.address ?? '',
    toToken: to.address ?? '',
    toChain: EVM_CHAIN_IDS[to.network],
    fromTokenAmount: BigInt(fromAmountBase),
    slippage,
  };
}

/**
 * Builds the Symbiosis provider for a source network. The protocol is bound to
 * the account on that network, so quoting and execution happen from there.
 */
export function useSymbiosisProvider(network: string, accountIndex: number): SwapProvider {
  const symbiosis = useProtocol<SymbiosisSwidge>({
    accountIndex,
    network,
    protocolType: 'swidge',
    protocolName: symbiosisProtocolName(network),
  });

  return useMemo<SwapProvider>(
    () => ({
      id: 'symbiosis',
      label: 'Symbiosis',

      async quote(request: SwapRequest) {
        const quote = await symbiosis.quoteSwidge(
          toOptions(request.from, request.to, request.fromAmountBase, request.slippage),
        );
        if (!quote) throw new Error('Symbiosis quote unavailable. Check the wallet and network.');
        return {
          provider: 'symbiosis',
          request,
          toAmount: String(quote.toTokenAmount),
          toAmountMin: String(quote.toTokenAmountMin),
          raw: quote,
        } satisfies SwapQuote;
      },

      async execute(quote: SwapQuote) {
        const { request } = quote;
        const result = await symbiosis.swidge(
          toOptions(request.from, request.to, request.fromAmountBase, request.slippage),
        );
        if (!result) throw new Error('Symbiosis swap could not be submitted.');
        return { provider: 'symbiosis', operationId: result.id, hash: result.hash } satisfies SwapResult;
      },

      async status(result: SwapResult) {
        const status = await symbiosis.getSwidgeStatus(result.operationId);
        return mapStatus(status?.status);
      },
    }),
    [symbiosis],
  );
}

/** Symbiosis reports pending for anything not yet final. Unknown values are unknown. */
function mapStatus(status: string | undefined): SwapStatus {
  switch (status) {
    case 'pending':
    case 'completed':
    case 'refunded':
    case 'failed':
      return status;
    default:
      return 'unknown';
  }
}
