import { useProtocol } from '@tetherto/wdk-react-native-core';

/**
 * The write methods of the Morpho gasless protocol. Each one sends any approval
 * or authorization transactions first, waits for them, then makes the call.
 * Amounts are in base units. The methods are allow-listed in `wdk.config.js`.
 */
export interface MorphoActions {
  deposit(options: { token: string; amount: number }): Promise<{ hash: string }>;
  withdrawFromVault(options: { token: string; amount: number }): Promise<{ hash: string }>;
  depositCollateral(options: { amount: number }): Promise<{ hash: string }>;
  borrowAgainstCollateral(options: { token: string; amount: number }): Promise<{ hash: string }>;
}

/** Actions for a vault instance. `savings` also runs the XAUt market actions. */
export function useVaultActions(protocolName: 'morpho-savings' | 'morpho-risk', accountIndex: number): MorphoActions {
  return useProtocol<MorphoActions>({
    accountIndex,
    network: 'ethereum',
    protocolType: 'lending',
    protocolName,
  });
}
