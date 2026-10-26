import { useEffect, useState } from 'react';
import { useProtocol } from '@tetherto/wdk-react-native-core';

/**
 * The read methods of the Morpho lending protocol that the Earn screen calls.
 * They are allow-listed in `wdk.config.js` under `allowedMethods`.
 */
export interface MorphoReads {
  getVaultPosition(): Promise<{ shares: string; assets: string; vaultAddress: string }>;
  getMarketPosition(): Promise<{ supplyShares: string; borrowShares: string; borrowAssets: string; collateral: string; marketId: string }>;
}

export interface EarnPositions {
  savings: string | null;
  riskCapital: string | null;
  collateral: string | null;
  borrowed: string | null;
  error: string | null;
  loading: boolean;
}

const EMPTY: EarnPositions = {
  savings: null,
  riskCapital: null,
  collateral: null,
  borrowed: null,
  error: null,
  loading: true,
};

/**
 * Reads the Earn positions for the active account on Ethereum. Each vault and
 * the XAUt market is its own protocol instance, so each is read separately.
 */
export function useEarnPositions(accountIndex: number): EarnPositions {
  const savingsProtocol = useProtocol<MorphoReads>({
    accountIndex,
    network: 'ethereum',
    protocolType: 'lending',
    protocolName: 'morpho-savings',
  });
  const riskProtocol = useProtocol<MorphoReads>({
    accountIndex,
    network: 'ethereum',
    protocolType: 'lending',
    protocolName: 'morpho-risk',
  });

  const [state, setState] = useState<EarnPositions>(EMPTY);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [vault, risk, market] = await Promise.all([
          savingsProtocol.getVaultPosition(),
          riskProtocol.getVaultPosition(),
          savingsProtocol.getMarketPosition(),
        ]);
        if (cancelled) return;
        setState({
          savings: vault ? String(vault.assets) : null,
          riskCapital: risk ? String(risk.assets) : null,
          collateral: market ? String(market.collateral) : null,
          borrowed: market ? String(market.borrowAssets) : null,
          error: null,
          loading: false,
        });
      } catch (e) {
        if (cancelled) return;
        setState({ ...EMPTY, error: e instanceof Error ? e.message : 'Could not load Earn positions.', loading: false });
      }
    })();
    return () => {
      cancelled = true;
    };
    // The protocol proxies are rebuilt when the account changes, so key on it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountIndex]);

  return state;
}
