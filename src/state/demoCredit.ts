import { create } from 'zustand';

/**
 * DEMO ONLY — frontend-only USDT credit from completed Transak buys.
 *
 * After returning from Transak, the quoted USDT amount is added here so the
 * balance shows it. Nothing is written to the chain or to disk: the credit
 * lives only in JS memory and resets on every cold app launch, by design for
 * the demo. Remove this store and its uses in useWalletData.ts once real
 * on-chain balances reflect Transak purchases.
 *
 * Keys are `${accountIndex}:${network}`; values are base-unit strings, the
 * same units the balance rows use, so they can be added directly.
 */
interface DemoCreditState {
  credits: Record<string, string>;
  addCredit: (accountIndex: number, network: string, baseUnits: string) => void;
}

export const creditKey = (accountIndex: number, network: string) => `${accountIndex}:${network}`;

export const useDemoCredit = create<DemoCreditState>((set) => ({
  credits: {},
  addCredit: (accountIndex, network, baseUnits) =>
    set((state) => {
      const key = creditKey(accountIndex, network);
      const previous = state.credits[key] ?? '0';
      return {
        credits: { ...state.credits, [key]: (BigInt(previous) + BigInt(baseUnits)).toString() },
      };
    }),
}));
