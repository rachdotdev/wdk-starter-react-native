import React, { useMemo, useState } from 'react';
import { View, Pressable, TextInput } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useRouter } from 'expo-router';
import BigNumber from 'bignumber.js';
import { Screen, ScreenHeader, Text, Card, Button } from '@/components';
import { useTheme } from '@/theme';
import { useResponsive } from '@/theme/responsive';
import { useWdkAddressForNetwork } from '@/wdk/hooks/useWalletData';
import { createTransak } from '@/wdk/fiat/transak';
import { fromBaseUnits, toBaseUnits } from '@/wdk/swap';
import { useAccounts } from '@/state/accounts';
import { useDemoCredit } from '@/state/demoCredit';
import { ASSETS } from '@/wdk/assets';

const NETWORKS = [
  { id: 'ethereum', label: 'Ethereum' },
  { id: 'arbitrum', label: 'Arbitrum' },
  { id: 'polygon', label: 'Polygon' },
] as const;

const USDT_DECIMALS = 6;

const CURRENCIES = ['EUR', 'USD'] as const;
type Currency = (typeof CURRENCIES)[number];

/**
 * Buy USDT with EUR through Transak. Pick the amount and the network, get a
 * quote, then open Transak's widget in the browser. The widget sends the USDT to
 * the wallet address for that network.
 */
export default function Buy() {
  const router = useRouter();
  const theme = useTheme();

  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<Currency>('EUR');
  const [network, setNetwork] = useState<(typeof NETWORKS)[number]['id']>('ethereum');
  const [quote, setQuote] = useState<{ crypto: string; fee: string; decimals: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { address } = useWdkAddressForNetwork(network);
  const activeIndex = useAccounts((s) => s.activeIndex);
  const transak = useMemo(() => createTransak(), []);

  /** Fiat amount in cents, as Transak expects. */
  function cents(): bigint | null {
    const value = new BigNumber(amount.replace(',', '.'));
    if (!value.isFinite() || value.lte(0)) return null;
    return BigInt(value.shiftedBy(2).toFixed(0));
  }

  async function getQuote() {
    setError(null);
    const fiatAmount = cents();
    if (fiatAmount === null) return setError('Enter a valid amount.');
    setBusy(true);
    try {
      const q = await transak.quoteBuy({
        cryptoAsset: 'USDT',
        fiatCurrency: currency,
        fiatAmount,
        config: { network, paymentMethod: 'credit_debit_card' },
      });
      // Transak returns the amount in the asset's own decimals, which can differ by environment.
      const assets = await transak.getSupportedCryptoAssets();
      const usdt = assets.find((a) => a.code === "USDT" && a.networkCode === network);
      setQuote({ crypto: String(q.cryptoAmount), fee: String(q.fee), decimals: usdt?.decimals ?? USDT_DECIMALS });
    } catch (e) {
      setQuote(null);
      setError(e instanceof Error ? e.message : 'Could not get a quote.');
    } finally {
      setBusy(false);
    }
  }

  async function openWidget() {
    setError(null);
    const fiatAmount = cents();
    if (fiatAmount === null) return setError('Enter a valid amount.');
    if (!address) return setError('No wallet address for this network yet.');
    setBusy(true);
    try {
      const { buyUrl } = await transak.buy({
        cryptoAsset: 'USDT',
        fiatCurrency: currency,
        fiatAmount,
        recipient: address,
        config: { network, paymentMethod: 'credit_debit_card', referrerDomain: process.env.EXPO_PUBLIC_TRANSAK_REFERRER_DOMAIN ?? 'localhost' },
      });
      // Keep Transak open until the user returns, then go back to the wallet home.
      await WebBrowser.openBrowserAsync(buyUrl);
      // DEMO ONLY: credit the quoted USDT to the balance in memory (see state/demoCredit.ts).
      if (quote) {
        const credit = toBaseUnits(fromBaseUnits(quote.crypto, quote.decimals), USDT_DECIMALS);
        const assetId = ASSETS.find((a) => a.getSymbol() === 'USDT' && a.getNetwork() === network)?.getId();
        if (credit && assetId) {
          useDemoCredit.getState().addCredit(activeIndex, network, credit, {
            id: `transak-demo-${Date.now()}`,
            assetId,
            amount: fromBaseUnits(quote.crypto, quote.decimals),
            timestamp: Date.now(),
          });
        }
      }
      router.dismissAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open Transak.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen scroll edges={['top', 'bottom']}>
      <ScreenHeader title="Buy USDT" onBack={() => router.back()} />
      <Text variant="body" color="textSecondary" style={{ marginBottom: 16 }}>
        Buy USDT with {currency}. Transak handles payment and identity checks.
      </Text>

      <Text variant="label" color="textSecondary">Currency</Text>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 6, marginBottom: 16 }}>
        {CURRENCIES.map((c) => (
          <Pressable
            key={c}
            onPress={() => {
              setCurrency(c);
              setQuote(null);
            }}
            style={{
              paddingVertical: 6,
              paddingHorizontal: 12,
              borderRadius: theme.radii.lg,
              borderWidth: 1,
              borderColor: c === currency ? 'transparent' : theme.colors.border,
              backgroundColor: c === currency ? theme.colors.brandTint : theme.colors.bgSecondary,
            }}
          >
            <Text variant="body" color={c === currency ? 'brand' : 'textSecondary'}>{c}</Text>
          </Pressable>
        ))}
      </View>

      <Text variant="label" color="textSecondary">Amount ({currency})</Text>
      <TextInput
        value={amount}
        onChangeText={(v) => {
          setAmount(v);
          setQuote(null);
        }}
        placeholder="0.00"
        placeholderTextColor={theme.colors.textSecondary}
        keyboardType="decimal-pad"
        style={{
          marginTop: 6,
          fontSize: 32,
          color: theme.colors.textPrimary,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
          paddingVertical: 8,
        }}
      />

      <Text variant="label" color="textSecondary" style={{ marginTop: 16 }}>Network</Text>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
        {NETWORKS.map((n) => (
          <Pressable
            key={n.id}
            onPress={() => {
              setNetwork(n.id);
              setQuote(null);
            }}
            style={{
              paddingVertical: 6,
              paddingHorizontal: 12,
              borderRadius: theme.radii.lg,
              borderWidth: 1,
              borderColor: n.id === network ? 'transparent' : theme.colors.border,
              backgroundColor: n.id === network ? theme.colors.brandTint : theme.colors.bgSecondary,
            }}
          >
            <Text variant="body" color={n.id === network ? 'brand' : 'textSecondary'}>{n.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={{ height: 16 }} />
      <Button label="Get quote" variant="secondary" onPress={getQuote} disabled={busy || !amount} loading={busy} />

      {quote ? (
        <Card style={{ marginTop: 16 }}>
          <Text variant="label" color="textSecondary">You receive about</Text>
          <Text variant="tokenName" style={{ marginTop: 4 }}>{fromBaseUnits(quote.crypto, quote.decimals)} USDT</Text>
          <Text variant="small" color="textSecondary" style={{ marginTop: 6 }}>
            Fee: {fromBaseUnits(quote.fee, 2)} {currency}. Payment and fees are shown in Transak's widget.
          </Text>
          <View style={{ height: 12 }} />
          <Button label="Continue to Transak" onPress={openWidget} disabled={busy} />
        </Card>
      ) : null}

      {error ? <Text variant="small" color="error" style={{ marginTop: 12 }}>{error}</Text> : null}
    </Screen>
  );
}
