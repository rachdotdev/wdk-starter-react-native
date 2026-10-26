import React, { useEffect, useMemo, useState } from 'react';
import { View, Pressable, Modal, TextInput, ScrollView, Linking, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowDown, ChevronDown, Search, X } from 'lucide-react-native';
import { Screen, ScreenHeader, Text, Card, Button, AssetIcon } from '@/components';
import { useTheme } from '@/theme';
import { useResponsive } from '@/theme/responsive';
import { useAccounts } from '@/state/accounts';
import { useWdkBalances } from '@/wdk/hooks/useWalletData';
import { useNativeGasBalances } from '@/wdk/hooks/useNativeGasBalances';
import { explorerFor } from '@/wdk/networks';
import { networkDisplayName } from '@/wdk/chains';
import {
  NATIVE_GAS_ASSETS,
  SWAP_TOKENS,
  allowedTargets,
  findSwapToken,
  fromBaseUnits,
  selectQuote,
  toBaseUnits,
  useSwapProviders,
  type QuoteSelection,
  type SwapMode,
  type SwapResult,
  type SwapStatus,
  type SwapToken,
} from '@/wdk/swap';

/** Poll interval and cap for the swap status, matching the LI.FI guidance. */
const STATUS_POLL_MS = 10_000;
const STATUS_POLL_ATTEMPTS = 60;
const TERMINAL: SwapStatus[] = ['completed', 'partial', 'refunded', 'failed', 'expired', 'cancelled'];

const DEFAULT_FROM = 'usdt-ethereum';
const DEFAULT_SLIPPAGE = 0.01;

const MODE_OPTIONS: { id: SwapMode; label: string }[] = [
  { id: 'automatic', label: 'Automatic' },
  { id: 'lifi', label: 'LI.FI' },
  { id: 'symbiosis', label: 'Symbiosis' },
  { id: 'zerox', label: '0x' },
  { id: 'rhinofi', label: 'Rhino.fi' },
];

type Phase = 'form' | 'quoted' | 'submitting' | 'done';
type Side = 'from' | 'to';

/**
 * Swap, laid out like a standard swap card: a Sell card, an arrow to flip the
 * direction, a Buy card, and a provider dropdown. Tapping a token opens the
 * picker, which has search and the wallet's balances.
 *
 * Allowed pairs (enforced by `allowedTargets`):
 *  - USDT on one chain to USDT on another chain (bridge)
 *  - USDT to the native gas token on the same chain, and back
 */
export default function Swap() {
  const router = useRouter();
  const theme = useTheme();
  const { moderateScale } = useResponsive();
  const { activeIndex } = useAccounts();
  const balances = useWdkBalances();

  const [fromId, setFromId] = useState(DEFAULT_FROM);
  const from = findSwapToken(fromId) ?? SWAP_TOKENS[0];
  const [toId, setToId] = useState<string>(() => allowedTargets(findSwapToken(DEFAULT_FROM)!)[0].id);
  const to = findSwapToken(toId) ?? allowedTargets(from)[0];

  const [pickerSide, setPickerSide] = useState<Side | null>(null);
  const [modeOpen, setModeOpen] = useState(false);
  const [search, setSearch] = useState('');

  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState<SwapMode>('automatic');
  const [phase, setPhase] = useState<Phase>('form');
  const [selection, setSelection] = useState<QuoteSelection | null>(null);
  const [result, setResult] = useState<SwapResult | null>(null);
  const [status, setStatus] = useState<SwapStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const providers = useSwapProviders(from.network, activeIndex);

  // Balance per wallet asset ID. Native gas tokens aren't in the wallet list, so they show none.
  const nativeBalances = useNativeGasBalances(activeIndex);

  const balanceById = useMemo(() => {
    const map = new Map<string, { amount: string; fiatValue: string }>();
    for (const b of balances.data) map.set(b.token.id, { amount: b.amount, fiatValue: b.fiatValue });
    for (const asset of NATIVE_GAS_ASSETS) {
      const raw = nativeBalances.get(asset.getId());
      if (raw == null) continue;
      map.set(asset.getId(), { amount: fromBaseUnits(raw, asset.getDecimals()), fiatValue: '—' });
    }
    return map;
  }, [balances.data, nativeBalances]);

  const targets = useMemo(() => allowedTargets(from), [from]);

  function resetQuote() {
    setSelection(null);
    setPhase('form');
    setError(null);
  }

  // Changing the source can leave the destination on a pair that is no longer allowed.
  function pickToken(side: Side, token: SwapToken) {
    if (side === 'from') {
      setFromId(token.id);
      const nextTargets = allowedTargets(token);
      if (!nextTargets.some((t) => t.id === toId)) setToId(nextTargets[0]?.id ?? '');
    } else {
      setToId(token.id);
    }
    setPickerSide(null);
    setSearch('');
    resetQuote();
  }

  function flip() {
    if (!targets.some((t) => t.id === to.id)) return;
    setFromId(to.id);
    setToId(from.id);
    resetQuote();
  }

  async function getQuote() {
    setError(null);
    const baseUnits = toBaseUnits(amount, from.decimals);
    if (!baseUnits) {
      setError('Enter a valid positive amount');
      return;
    }
    setBusy(true);
    try {
      const picked = await selectQuote(providers, {
        from,
        to,
        amount,
        fromAmountBase: baseUnits,
        slippage: DEFAULT_SLIPPAGE,
      }, mode);
      setSelection(picked);
      setPhase('quoted');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not get a quote');
    } finally {
      setBusy(false);
    }
  }

  async function confirmSwap() {
    if (!selection) return;
    setError(null);
    setPhase('submitting');
    const provider = providers.find((p) => p.id === selection.chosen.provider);
    try {
      if (!provider) throw new Error('Provider is no longer available.');
      const submitted = await provider.execute(selection.chosen);
      setResult(submitted);
      setStatus('pending');
      setPhase('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Swap failed');
      setPhase('quoted');
    }
  }

  // Poll the status of the submitted swap until it reaches a terminal state
  // or the attempt cap. Only a new submission restarts polling.
  useEffect(() => {
    if (!result || !selection) return;
    const provider = providers.find((p) => p.id === result.provider);
    if (!provider) return;
    const request = selection.chosen.request;

    let cancelled = false;
    let attempt = 0;
    let timeout: ReturnType<typeof setTimeout>;

    const poll = async () => {
      try {
        const next = await provider.status(result, request);
        if (cancelled) return;
        setStatus(next);
        if (TERMINAL.includes(next)) return;
      } catch {
        // The swap can take a while to be indexed, so keep polling until the cap.
      }
      attempt += 1;
      if (!cancelled && attempt < STATUS_POLL_ATTEMPTS) timeout = setTimeout(poll, STATUS_POLL_MS);
    };

    timeout = setTimeout(poll, STATUS_POLL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
    // Keyed on the submitted swap only; `providers` and `selection` are read once per submission.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  const explorer = result?.hash ? explorerFor(from.network) : undefined;
  const fromBalance = balanceById.get(from.id);
  const toBalance = balanceById.get(to.id);
  const pickerTokens = (pickerSide === 'to' ? targets : SWAP_TOKENS).filter((t) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return t.symbol.toLowerCase().includes(q) || networkDisplayName(t.network).toLowerCase().includes(q);
  });
  const providerLabel = MODE_OPTIONS.find((m) => m.id === mode)?.label ?? 'Automatic';
  const chosenLabel = selection
    ? providers.find((p) => p.id === selection.chosen.provider)?.label ?? selection.chosen.provider
    : null;

  return (
    <Screen scroll edges={['top', 'bottom']}>
      <ScreenHeader title="Swap" onBack={() => router.back()} />

      {phase === 'done' && result ? (
        <Card>
          <Text variant="tokenName">Swap submitted</Text>
          <Text variant="small" color="textSecondary" style={{ marginTop: 6 }}>
            Provider: {providers.find((p) => p.id === result.provider)?.label ?? result.provider}
          </Text>
          <Text variant="small" color="textSecondary" style={{ marginTop: 4 }}>
            Status: {status ?? 'pending'}
          </Text>
          {explorer && result.hash ? (
            <Button
              label={`View on ${explorer.name}`}
              variant="tinted"
              onPress={() => Linking.openURL(explorer.url(result.hash!))}
            />
          ) : null}
          <View style={{ height: 8 }} />
          <Button label="Back to wallet" variant="secondary" onPress={() => router.back()} />
        </Card>
      ) : (
        <>
          {/* Sell card */}
          <View style={[styles.card, { backgroundColor: theme.colors.bgSecondary, borderRadius: theme.radii.lg, borderColor: theme.colors.border }]}>
            <Text variant="label" color="textSecondary">Sell</Text>
            <View style={styles.row}>
              <TextInput
                value={amount}
                onChangeText={(v) => {
                  setAmount(v.replace(",", "."));
                  resetQuote();
                }}
                placeholder="0"
                placeholderTextColor={theme.colors.textSecondary}
                keyboardType="decimal-pad"
                style={[styles.amountInput, styles.amountText, { color: theme.colors.textPrimary, fontSize: moderateScale(36), lineHeight: moderateScale(46) }]}
              />
              <TokenButton token={from} onPress={() => setPickerSide('from')} />
            </View>
            <View style={styles.rowBetween}>
              <Text variant="small" color="textSecondary">
                {networkDisplayName(from.network)}
              </Text>
              <Text variant="small" color="textSecondary">
                {fromBalance ? `${fromBalance.amount} ${from.symbol}` : `— ${from.symbol}`}
              </Text>
            </View>
          </View>

          {/* Flip */}
          <View style={styles.flipWrap}>
            <Pressable
              onPress={flip}
              accessibilityLabel="Switch tokens"
              style={[styles.flip, { backgroundColor: theme.colors.bgPrimary ?? theme.colors.bgSecondary, borderColor: theme.colors.border }]}
            >
              <ArrowDown size={moderateScale(18)} color={theme.colors.textPrimary} />
            </Pressable>
          </View>

          {/* Buy card */}
          <View style={[styles.card, { backgroundColor: theme.colors.bgSecondary, borderRadius: theme.radii.lg, borderColor: theme.colors.border }]}>
            <Text variant="label" color="textSecondary">Buy</Text>
            <View style={styles.row}>
              <Text
                variant="tokenName"
                numberOfLines={1}
                style={[styles.amountText, { flex: 1, minWidth: 0, fontSize: moderateScale(36), lineHeight: moderateScale(46) }]}
                color={selection ? 'textPrimary' : 'textSecondary'}
              >
                {selection ? fromBaseUnits(selection.chosen.toAmount, to.decimals) : '0'}
              </Text>
              <TokenButton token={to} onPress={() => setPickerSide('to')} />
            </View>
            <View style={styles.rowBetween}>
              <Text variant="small" color="textSecondary">{networkDisplayName(to.network)}</Text>
              <Text variant="small" color="textSecondary">
                {toBalance ? `${toBalance.amount} ${to.symbol}` : `— ${to.symbol}`}
              </Text>
            </View>
          </View>

          {/* Provider dropdown */}
          <Pressable
            onPress={() => setModeOpen((v) => !v)}
            style={[styles.dropdown, { backgroundColor: theme.colors.bgSecondary, borderColor: theme.colors.border, borderRadius: theme.radii.md }]}
          >
            <Text variant="small" color="textSecondary">Provider</Text>
            <View style={styles.dropdownValue}>
              <Text variant="body">{providerLabel}</Text>
              <ChevronDown size={moderateScale(16)} color={theme.colors.textSecondary} />
            </View>
          </Pressable>
          {modeOpen ? (
            <View style={[styles.menu, { backgroundColor: theme.colors.bgSecondary, borderColor: theme.colors.border, borderRadius: theme.radii.md }]}>
              {MODE_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.id}
                  onPress={() => {
                    setMode(opt.id);
                    setModeOpen(false);
                    resetQuote();
                  }}
                  style={styles.menuItem}
                >
                  <Text variant="body" color={opt.id === mode ? 'brand' : 'textPrimary'}>{opt.label}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          {phase === 'form' ? (
            <View style={{ marginTop: 16 }}>
              <Button
                label={busy ? 'Getting quote…' : 'Get quote'}
                onPress={getQuote}
                disabled={!amount || busy}
                loading={busy}
              />
            </View>
          ) : null}

          {(phase === 'quoted' || phase === 'submitting') && selection ? (
            <Card style={{ marginTop: 16 }}>
              <Text variant="small" color="textSecondary">
                Route: {chosenLabel}
                {mode === 'automatic' && selection.compared.length > 1 ? ' (best of compared quotes)' : ''}
              </Text>
              <Text variant="small" color="textSecondary" style={{ marginTop: 4 }}>
                Minimum received: {fromBaseUnits(selection.chosen.toAmountMin, to.decimals)} {to.symbol}
              </Text>
              {selection.failures.length > 0 ? (
                <Text variant="small" color="textSecondary" style={{ marginTop: 4 }}>
                  Unavailable: {selection.failures.join('; ')}
                </Text>
              ) : null}
              <View style={{ height: 12 }} />
              <Button
                label={phase === 'submitting' ? 'Submitting…' : 'Swap'}
                onPress={confirmSwap}
                disabled={phase === 'submitting'}
              />
              <View style={{ height: 8 }} />
              <Button label="Edit" variant="secondary" onPress={resetQuote} disabled={phase === 'submitting'} />
            </Card>
          ) : null}

          {error ? (
            <Text variant="small" color="error" style={{ marginTop: 12 }}>{error}</Text>
          ) : null}
        </>
      )}

      {/* Token picker */}
      <Modal visible={pickerSide !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setPickerSide(null)}>
        <View style={{ flex: 1, backgroundColor: theme.colors.bgPrimary ?? theme.colors.bgSecondary, padding: 16 }}>
          <View style={styles.pickerHeader}>
            <Text variant="tokenName">Select a token</Text>
            <Pressable onPress={() => setPickerSide(null)} hitSlop={12}>
              <X size={moderateScale(22)} color={theme.colors.textPrimary} />
            </Pressable>
          </View>

          <View style={[styles.search, { backgroundColor: theme.colors.bgSecondary, borderColor: theme.colors.border, borderRadius: theme.radii.md }]}>
            <Search size={moderateScale(18)} color={theme.colors.textSecondary} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search tokens"
              placeholderTextColor={theme.colors.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              style={{ flex: 1, marginLeft: 8, color: theme.colors.textPrimary, fontSize: moderateScale(15) }}
            />
          </View>

          <Text variant="label" color="textSecondary" style={{ marginTop: 16, marginBottom: 8 }}>Your tokens</Text>
          <ScrollView>
            {pickerTokens.map((t) => {
              const bal = balanceById.get(t.id);
              return (
                <Pressable
                  key={t.id}
                  onPress={() => pickToken(pickerSide ?? 'from', t)}
                  style={styles.tokenRow}
                >
                  <AssetIcon symbol={t.symbol} network={t.network} size={moderateScale(38)} showChainBadge={t.symbol.startsWith('USDT')} />
                  <View style={{ flex: 1 }}>
                    <Text variant="tokenName">{t.symbol}</Text>
                    <Text variant="small" color="textSecondary">{networkDisplayName(t.network)}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text variant="tokenName">{bal ? bal.fiatValue : ''}</Text>
                    <Text variant="small" color="textSecondary">{bal ? bal.amount : '0'}</Text>
                  </View>
                </Pressable>
              );
            })}
            {pickerTokens.length === 0 ? (
              <Text variant="small" color="textSecondary">No tokens match your search.</Text>
            ) : null}
          </ScrollView>
        </View>
      </Modal>
    </Screen>
  );
}

function TokenButton({ token, onPress }: { token: SwapToken; onPress: () => void }) {
  const theme = useTheme();
  const { moderateScale } = useResponsive();
  return (
    <Pressable
      onPress={onPress}
      style={[styles.tokenButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.bgPrimary ?? theme.colors.bgSecondary, borderRadius: theme.radii.lg }]}
    >
      <AssetIcon symbol={token.symbol} network={token.network} size={moderateScale(26)} showChainBadge={token.symbol.startsWith('USDT')} />
      <Text variant="tokenName">{token.symbol}</Text>
      <ChevronDown size={moderateScale(16)} color={theme.colors.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, padding: 16 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  amountInput: { flex: 1, minWidth: 0, paddingVertical: 0 },
  amountText: { fontWeight: "400" },
  tokenButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  flipWrap: { alignItems: 'center', marginVertical: -14, zIndex: 1 },
  flip: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  dropdown: { marginTop: 16, borderWidth: 1, paddingVertical: 10, paddingHorizontal: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dropdownValue: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  menu: { borderWidth: 1, marginTop: 6, overflow: 'hidden' },
  menuItem: { paddingVertical: 12, paddingHorizontal: 14 },
  pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  search: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, paddingVertical: 10, paddingHorizontal: 12 },
  tokenRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
});
