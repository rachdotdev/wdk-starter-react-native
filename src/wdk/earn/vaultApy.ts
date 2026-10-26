import { useQuery } from '@tanstack/react-query';

/** Morpho's public GraphQL API. Reads only; no key needed. */
const MORPHO_API = 'https://api.morpho.org/graphql';

/** Ethereum mainnet vault addresses, the same ones used by the Earn screen. */
export const SAVINGS_VAULT = '0x23f5E9c35820f4baB695Ac1F19c203cC3f8e1e11';
export const RISK_VAULT = '0x2bD3A43863c07B6A01581FADa0E1614ca5DF0E3d';

/**
 * Net APY of a Morpho vault, as a decimal (0.0304 = 3.04%). The WDK module does
 * not expose APY, so it is read from Morpho's API. Refreshed at most once a
 * minute, like the balances.
 */
export function useVaultNetApy(vaultAddress: string) {
  return useQuery({
    queryKey: ['morpho-vault-net-apy', vaultAddress],
    queryFn: async (): Promise<number> => {
      const response = await fetch(MORPHO_API, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          query: `{ vaultV2ByAddress(address: "${vaultAddress}", chainId: 1) { netApy } }`,
        }),
      });
      const json = await response.json();
      const netApy = json?.data?.vaultV2ByAddress?.netApy;
      if (typeof netApy !== 'number') throw new Error('APY unavailable');
      return netApy;
    },
    staleTime: 60_000,
  });
}
