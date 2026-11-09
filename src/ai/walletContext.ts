import type { Account, TokenBalance, Transaction } from '@/domain/models';

/**
 * Builds the assistant's system prompt from the wallet data the screen
 * already has. Only public, read-only facts go in: account name, balances,
 * recent transfers. Never the seed phrase, keys or password — the assistant
 * doesn't need them, and the WDK worklet never exposes them to JS anyway.
 *
 * Everything stays on the device: the prompt is consumed by the local QVAC
 * model, not sent to any server.
 */

const MAX_TRANSACTIONS = 10;

function formatBalance(b: TokenBalance): string {
  if (b.fetchFailed) return `- ${b.token.symbol} on ${b.token.chain}: unavailable (fetch failed)`;
  return `- ${b.token.symbol} on ${b.token.chain}: ${b.amount} (${b.fiatValue})`;
}

function formatTransaction(t: Transaction): string {
  const date = new Date(t.timestamp).toISOString().slice(0, 10);
  const verb = t.direction === 'in' ? 'Received' : 'Sent';
  const preposition = t.direction === 'in' ? 'from' : 'to';
  return `- ${date}: ${verb} ${t.amount} ${t.token.symbol} on ${t.token.chain} ${preposition} ${t.address} (${t.status})`;
}

export function buildWalletSystemPrompt(input: {
  account: Account | null;
  totalUsd: string | null | undefined;
  balances: TokenBalance[];
  transactions: Transaction[];
}): string {
  const { account, totalUsd, balances, transactions } = input;

  const balanceLines = balances.length ? balances.map(formatBalance).join('\n') : '- (no balances loaded)';
  const txLines = transactions.length
    ? transactions.slice(0, MAX_TRANSACTIONS).map(formatTransaction).join('\n')
    : '- (no recent transactions)';

  return [
    'You are the built-in assistant of a self-custodial crypto wallet built with Tether WDK.',
    'You run entirely on the user\'s phone. Answer briefly and clearly, in plain language.',
    'You can explain the user\'s balances and activity and general crypto concepts (networks, gas, stablecoins, self-custody, seed phrases).',
    'You CANNOT send, sign or move funds. If asked to, tell the user to use the Send button.',
    'Never ask for the seed phrase, private keys or password. Remind the user never to share them.',
    'Only use the wallet data below. If something is not in it, say you do not know.',
    '',
    `Account: ${account?.name ?? 'unknown'}`,
    `Total balance: ${totalUsd ?? 'unknown'}`,
    'Balances:',
    balanceLines,
    'Recent transactions (newest first):',
    txLines,
  ].join('\n');
}
