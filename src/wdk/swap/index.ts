import BigNumber from 'bignumber.js';
import { useLifiProvider } from "./lifi";
import { useSymbiosisProvider } from "./symbiosis";
import { useZeroExProvider } from "./zerox";
import { useRhinofiProvider } from "./rhinofi";
import type { SwapProvider } from './types';

export * from './tokens';
export * from './types';
export { selectQuote } from './automatic';
export type { QuoteSelection } from './automatic';

/**
 * Every swap provider the app can use for a source network. Automatic mode
 * compares these. Add a provider by calling its hook here, after it has been
 * reviewed, and registering its protocol in `wdk.config.js`.
 */
export function useSwapProviders(network: string, accountIndex: number): SwapProvider[] {
  const lifi = useLifiProvider(network, accountIndex);
  const symbiosis = useSymbiosisProvider(network, accountIndex);
  const zerox = useZeroExProvider(network, accountIndex);
  const rhinofi = useRhinofiProvider(network, accountIndex);
  return [lifi, symbiosis, zerox, rhinofi];
}

/**
 * Converts a human amount ("10.5") to base units. Returns `null` for input
 * that isn't a positive number.
 */
export function toBaseUnits(amount: string, decimals: number): string | null {
  const parsed = new BigNumber(amount.trim().replace(",", "."));
  if (!parsed.isFinite() || parsed.isNegative() || parsed.isZero()) return null;
  return parsed.shiftedBy(decimals).toFixed(0);
}

/** Formats base units back to a human amount, without trailing zeros. */
export function fromBaseUnits(value: string, decimals: number): string {
  const human = new BigNumber(value).shiftedBy(-decimals).toFixed();
  return human.includes('.') ? human.replace(/0+$/, '').replace(/\.$/, '') : human;
}
