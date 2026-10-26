import { create } from 'zustand';

/**
 * DEMO ONLY — frontend-only USDT credit from completed Transak buys.
 *
 * After returning from Transak, the quoted USDT amount is added here so the
 * balance shows it, and a matching incoming transfer is listed in Activity.
 * Nothing is written to the chain or to disk: this lives only in JS memory and
 * resets on every cold app launch, by design for the demo. Remove this store
 * and its uses in useWalletData.ts once real on-chain data reflects Transak
 * purchases.
 *
 * Keys are `${accountIndex}:${network}`; credit values are base-unit strings,
 * the same units the balance rows use, so they can be added directly.
 */
export interface DemoTransfer {
  id: string;
  assetId: string;
  amount: string; // human-readable, e.g. "10.5"
  timestamp: number; // milliseconds, same unit as indexer transfers
}

interface DemoCreditState {
  credits: Record<string, string>;
  transfers: Record<string, DemoTransfer[]>;
  addCredit: (accountIndex: number, network: string, baseUnits: string, transfer: DemoTransfer) => void;
}

export const creditKey = (accountIndex: number, network: string) => `${accountIndex}:${network}`;

export const useDemoCredit = create<DemoCreditState>((set) => ({
  credits: {},
  transfers: {},
  addCredit: (accountIndex, network, baseUnits, transfer) =>
    set((state) => {
      const key = creditKey(accountIndex, network);
      const previous = state.credits[key] ?? '0';
      return {
        credits: { ...state.credits, [key]: (BigInt(previous) + BigInt(baseUnits)).toString() },
        transfers: { ...state.transfers, [key]: [...(state.transfers[key] ?? []), transfer] },
      };
    }),
}));
