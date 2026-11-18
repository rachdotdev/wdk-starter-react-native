/**
 * Client for the SDA backend in server/. The app never talks to Candide
 * directly: the Forwarding API URL embeds a billed API key and activation
 * needs the policy secret, so both stay on the server.
 */
const SERVER_URL = process.env.EXPO_PUBLIC_SDA_SERVER_URL?.replace(/\/+$/, '');

export const isSdaConfigured = Boolean(SERVER_URL);

export type DepositAddress = {
  address: string;
  expiry: number; // Unix seconds
  sourceChains: number[];
  destinationChain: number;
  recipient: string;
  accepts: { chain: number; symbol: string; token: string; decimals: number }[];
};

export type DepositTransfer = {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'refunded' | 'expired' | string;
  providerStatus?: string;
  sourceChainId?: number;
  destinationChainId?: number;
  sourceTxHash?: string;
  destinationTxHash?: string;
};

async function get<T>(path: string, recipient: string): Promise<T> {
  if (!SERVER_URL) throw new Error('EXPO_PUBLIC_SDA_SERVER_URL is not set');
  const res = await fetch(`${SERVER_URL}${path}?recipient=${encodeURIComponent(recipient)}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`);
  return body as T;
}

export const fetchDepositAddress = (recipient: string) => get<DepositAddress>('/deposit-address', recipient);
export const fetchDepositTransfers = (recipient: string) => get<DepositTransfer[]>('/transfers', recipient);

const CHAIN_NAMES: Record<number, string> = {
  1: 'Ethereum',
  10: 'Optimism',
  137: 'Polygon',
  42161: 'Arbitrum',
};

export const chainName = (id?: number) => (id === undefined ? '—' : CHAIN_NAMES[id] ?? `Chain ${id}`);

/** USD₮ in prose; the API returns the raw symbol. */
const TOKEN_LABELS: Record<string, string> = { USDT: 'USD₮', USDT0: 'USD₮0', XAUT: 'XAU₮', XAUT0: 'XAU₮0' };
export const tokenLabel = (symbol: string) => TOKEN_LABELS[symbol.toUpperCase()] ?? symbol;
