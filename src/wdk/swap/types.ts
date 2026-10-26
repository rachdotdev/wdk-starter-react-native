import type { SwapToken } from './tokens';

export type SwapProviderId = "lifi" | "symbiosis" | "zerox" | "rhinofi";

/** What the user picked: a single provider, or let the app compare them. */
export type SwapMode = 'automatic' | SwapProviderId;

export interface SwapRequest {
  from: SwapToken;
  to: SwapToken;
  /** Human amount, e.g. "10.5". */
  amount: string;
  /** Amount in the source token's base units. */
  fromAmountBase: string;
  slippage: number;
}

export interface SwapQuote {
  provider: SwapProviderId;
  request: SwapRequest;
  /** Expected output, in the destination token's base units. */
  toAmount: string;
  /** Worst-case output after slippage, in base units. Used as the price guard. */
  toAmountMin: string;
  /** Provider's own quote data, handed back to `execute` unchanged. */
  raw: unknown;
}

export interface SwapResult {
  provider: SwapProviderId;
  /** Provider operation ID, used to poll status. */
  operationId: string;
  /** Source chain transaction hash. */
  hash: string | null;
}

export type SwapStatus =
  | 'pending'
  | 'completed'
  | 'partial'
  | 'refunded'
  | 'refund-pending'
  | 'failed'
  | 'expired'
  | 'cancelled'
  | 'action-required'
  | 'unknown';

export interface SwapProvider {
  id: SwapProviderId;
  label: string;
  quote(request: SwapRequest): Promise<SwapQuote>;
  execute(quote: SwapQuote): Promise<SwapResult>;
  status(result: SwapResult, request: SwapRequest): Promise<SwapStatus>;
}
