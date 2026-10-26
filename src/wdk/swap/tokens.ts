import { ASSETS } from '@/wdk/assets';
import { AppAsset } from '@/wdk/AppAsset';

/**
 * Swap is EVM-only for now (LI.FI routes between EVM networks). Bitcoin and
 * Spark are not swappable.
 */
export type SwapNetwork = 'ethereum' | 'arbitrum' | 'polygon';

export const SWAP_NETWORKS: SwapNetwork[] = ['ethereum', 'arbitrum', 'polygon'];

export interface SwapToken {
  id: string;
  network: SwapNetwork;
  symbol: string;
  decimals: number;
  /** Token contract address, or `null` for the chain's native gas token. */
  address: string | null;
  isNative: boolean;
}

/**
 * Native gas tokens are swap-only. They are not in the wallet asset list,
 * because the indexer has no "eth" type, so an ETH balance would show up
 * without any history in Activity.
 */
const NATIVE_GAS_TOKENS: Record<SwapNetwork, { symbol: string }> = {
  ethereum: { symbol: 'ETH' },
  arbitrum: { symbol: 'ETH' },
  polygon: { symbol: 'POL' },
};

const USDT_TOKENS: SwapToken[] = ASSETS.filter(
  (a) => !a.isNative() && (SWAP_NETWORKS as string[]).includes(a.getNetwork()),
).map((a) => ({
  id: a.getId(),
  network: a.getNetwork() as SwapNetwork,
  symbol: a.getSymbol(),
  decimals: a.getDecimals(),
  address: a.getContractAddress(),
  isNative: false,
}));

const NATIVE_TOKENS: SwapToken[] = SWAP_NETWORKS.map((network) => ({
  id: `native-${network}`,
  network,
  symbol: NATIVE_GAS_TOKENS[network].symbol,
  decimals: 18,
  address: null,
  isNative: true,
}));

export const SWAP_TOKENS: SwapToken[] = [...USDT_TOKENS, ...NATIVE_TOKENS];

export function findSwapToken(id: string): SwapToken | undefined {
  return SWAP_TOKENS.find((t) => t.id === id);
}

/** USDT on any chain: Ethereum/Polygon USDT and Arbitrum's USDT0. */
export function isUsdt(token: SwapToken): boolean {
  return !token.isNative && token.symbol.startsWith('USDT');
}

/**
 * The only pairs the feature offers:
 *  - USDT on one chain to USDT on another chain (bridge), or
 *  - USDT to the native gas token of the same chain, in either direction.
 */
export function isAllowedPair(from: SwapToken, to: SwapToken): boolean {
  if (from.id === to.id) return false;
  if (isUsdt(from) && isUsdt(to)) return from.network !== to.network;
  const sameChain = from.network === to.network;
  return sameChain && ((isUsdt(from) && to.isNative) || (from.isNative && isUsdt(to)));
}

export function allowedTargets(from: SwapToken): SwapToken[] {
  return SWAP_TOKENS.filter((t) => isAllowedPair(from, t));
}

/**
 * Native gas tokens as assets, so the balance hook can fetch their balances.
 * They are not in the wallet list, so this is the only place they are read.
 */
export const NATIVE_GAS_ASSETS: AppAsset[] = SWAP_NETWORKS.map(
  (network) =>
    new AppAsset({
      id: `native-${network}`,
      network,
      symbol: NATIVE_GAS_TOKENS[network].symbol,
      name: NATIVE_GAS_TOKENS[network].symbol,
      decimals: 18,
      isNative: true,
      address: null,
    }),
);
