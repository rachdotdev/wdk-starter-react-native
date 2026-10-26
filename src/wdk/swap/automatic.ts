import type { SwapMode, SwapProvider, SwapQuote, SwapRequest } from './types';

export interface QuoteSelection {
  /** The quote the user will execute. */
  chosen: SwapQuote;
  /** Every successful quote that was compared, best first. */
  compared: SwapQuote[];
  /** Error messages from providers that failed to quote. */
  failures: string[];
}

/**
 * Gets quotes for a request and picks one.
 *
 * - A specific provider id quotes only that provider.
 * - "automatic" quotes every provider in parallel and picks the highest
 *   expected output. A provider that fails is left out, and the remaining
 *   quotes still compete. If none succeed, the error is thrown.
 */
export async function selectQuote(
  providers: SwapProvider[],
  request: SwapRequest,
  mode: SwapMode,
): Promise<QuoteSelection> {
  const candidates = mode === 'automatic' ? providers : providers.filter((p) => p.id === mode);
  if (candidates.length === 0) throw new Error('No swap provider is available for this route.');

  const settled = await Promise.allSettled(candidates.map((p) => p.quote(request)));

  const quotes: SwapQuote[] = [];
  const failures: string[] = [];
  settled.forEach((result, i) => {
    if (result.status === 'fulfilled') quotes.push(result.value);
    else failures.push(`${candidates[i].label}: ${errorMessage(result.reason)}`);
  });

  if (quotes.length === 0) {
    throw new Error(failures.join('\n') || 'No quote was returned.');
  }

  // Same destination token for every provider, so the base units compare directly.
  quotes.sort((a, b) => (BigInt(b.toAmount) > BigInt(a.toAmount) ? 1 : BigInt(b.toAmount) < BigInt(a.toAmount) ? -1 : 0));
  return { chosen: quotes[0], compared: quotes, failures };
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
