import { useMemo } from 'react';
import { useBalance } from '@tetherto/wdk-react-native-core';
import { NATIVE_GAS_ASSETS } from '@/wdk/swap/tokens';

/**
 * Balances of the native gas tokens (ETH, POL) used by the Swap screen.
 *
 * Each token gets its own balance query. The batch hook keys its cache by
 * wallet and account only, so it would reuse the wallet-list result and never
 * fetch these tokens.
 *
 * NATIVE_GAS_ASSETS is a fixed list, so calling the hook once per asset keeps
 * the hook order stable across renders.
 */
export function useNativeGasBalances(accountIndex: number): Map<string, string> {
  const [ethereum, arbitrum, polygon] = NATIVE_GAS_ASSETS.map((asset) =>
    useBalance(accountIndex, asset, { enabled: true, staleTime: 60_000 }),
  );
  const results = [ethereum, arbitrum, polygon];

  return useMemo(() => {
    const map = new Map<string, string>();
    NATIVE_GAS_ASSETS.forEach((asset, i) => {
      const row = results[i]?.data;
      if (row?.success && row.balance != null) map.set(asset.getId(), String(row.balance));
    });
    return map;
    // `results` is rebuilt each render, so key on the balances it contains.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ethereum.data, arbitrum.data, polygon.data]);
}
