import { useMemo } from 'react';
import { useProtocol } from '@tetherto/wdk-react-native-core';
import { rhinofiProtocolName } from '@/wdk/networks';
import type { SwapToken } from './tokens';
import type { SwapProvider, SwapQuote, SwapRequest, SwapResult, SwapStatus } from './types';

/**
 * The methods of `@rhino.fi/wdk-protocol-swidge-rhinofi` that the app calls.
 * They are allow-listed in `wdk.config.js` under `allowedMethods`.
 */
interface RhinoSwidge {
  quoteSwidge(options: RhinoOptions): Promise<RhinoQuote>;
  swidge(options: RhinoOptions): Promise<RhinoExecution>;
  getSwidgeStatus(id: string): Promise<{ status: string }>;
}

interface RhinoOptions {
  fromToken: string;
  toToken: string;
  toChain: string;
  fromTokenAmount: bigint;
}

interface RhinoQuote {
  toTokenAmount: string | bigint;
  toTokenAmountMin: string | bigint;
}

interface RhinoExecution {
  id: string;
  hash: string | null;
}

/** Rhino.fi's chain identifiers for the networks the app supports. */
const RHINO_CHAINS: Record<string, string> = {
  ethereum: 'ETHEREUM',
  arbitrum: 'ARBITRUM',
  polygon: 'POLYGON',
};

/** Destinations Rhino.fi rejects, verified: "Chain POLYGON is not supported by the rhino.fi protocol". */
const RHINO_UNSUPPORTED_DESTINATIONS = new Set(['polygon']);

/** Rhino.fi's SDK has no timeout on its requests, so the app bounds each call. */
const RHINO_CALL_TIMEOUT_MS = 30_000;

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Rhino.fi  did not respond within 30 seconds.`)), RHINO_CALL_TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function toOptions(from: SwapToken, to: SwapToken, fromAmountBase: string): RhinoOptions {
  return {
    fromToken: from.address ?? '',
    toToken: to.address ?? '',
    toChain: RHINO_CHAINS[to.network],
    fromTokenAmount: BigInt(fromAmountBase),
  };
}

/**
 * Builds the Rhino.fi provider for a source network. The protocol is bound to
 * the account on the source network, so quoting and execution happen from there.
 */
export function useRhinofiProvider(network: string, accountIndex: number): SwapProvider {
  const rhino = useProtocol<RhinoSwidge>({
    accountIndex,
    network,
    protocolType: 'swidge',
    protocolName: rhinofiProtocolName(network),
  });

  return useMemo<SwapProvider>(
    () => ({
      id: 'rhinofi',
      label: 'Rhino.fi',

      async quote(request: SwapRequest) {
        // Rejected by Rhino.fi as a destination. Checked here so Automatic mode
        // does not send a request that is known to fail and log it as an error.
        if (RHINO_UNSUPPORTED_DESTINATIONS.has(request.to.network)) {
          throw new Error('Rhino.fi does not support this destination chain.');
        }
        const quote = await withTimeout(rhino.quoteSwidge(toOptions(request.from, request.to, request.fromAmountBase)), "quote");
        if (!quote) throw new Error('Rhino.fi quote unavailable. Check the wallet and network.');
        return {
          provider: 'rhinofi',
          request,
          toAmount: String(quote.toTokenAmount),
          toAmountMin: String(quote.toTokenAmountMin),
          raw: quote,
        } satisfies SwapQuote;
      },

      async execute(quote: SwapQuote) {
        const { request } = quote;
        const result = await withTimeout(rhino.swidge(toOptions(request.from, request.to, request.fromAmountBase)), "swap");
        if (!result) throw new Error('Rhino.fi swap could not be submitted.');
        return { provider: 'rhinofi', operationId: result.id, hash: result.hash } satisfies SwapResult;
      },

      async status(result: SwapResult) {
        const status = await rhino.getSwidgeStatus(result.operationId);
        return mapStatus(status?.status);
      },
    }),
    [rhino],
  );
}

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
