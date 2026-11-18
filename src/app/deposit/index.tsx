import React, { useCallback, useEffect, useState } from 'react';
import { View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { Check, Copy, TriangleAlert, RefreshCw } from 'lucide-react-native';
import { Screen, ScreenHeader, Text, Card, LoadingState, ErrorState, EmptyState } from '@/components';
import { useTheme } from '@/theme';
import { useResponsive } from '@/theme/responsive';
import { useWdkAddressForNetwork } from '@/wdk/hooks/useWalletData';
import {
  isSdaConfigured,
  fetchDepositAddress,
  fetchDepositTransfers,
  chainName,
  tokenLabel,
  type DepositAddress,
  type DepositTransfer,
} from '@/sda/client';

/**
 * Deposit from any chain — a Smart Deposit Address (Candide forwarding
 * address). The user sends USD₮ to one address on any supported source
 * chain (from a wallet or an exchange), and it is forwarded to their own
 * Arbitrum address in this wallet.
 *
 * Activation, renewal and history go through server/ (see
 * docs/SMART_DEPOSIT_ADDRESSES.md). This screen only reads.
 */
export default function Deposit() {
  const router = useRouter();
  const theme = useTheme();
  const { moderateScale } = useResponsive();
  const recipient = useWdkAddressForNetwork('arbitrum');

  const [deposit, setDeposit] = useState<DepositAddress | null>(null);
  const [transfers, setTransfers] = useState<DepositTransfer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!recipient.address) return;
    setLoading(true);
    setError(null);
    try {
      const live = await fetchDepositAddress(recipient.address);
      setDeposit(live);
      setTransfers(await fetchDepositTransfers(recipient.address).catch(() => []));
    } catch (e) {
      setDeposit(null);
      setError(e instanceof Error ? e.message : 'Could not load your deposit address');
    } finally {
      setLoading(false);
    }
  }, [recipient.address]);

  useEffect(() => {
    if (isSdaConfigured) load();
  }, [load]);

  const onCopy = async () => {
    if (!deposit) return;
    await Clipboard.setStringAsync(deposit.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const header = <ScreenHeader title="Deposit from any chain" onBack={() => router.back()} />;

  if (!isSdaConfigured) {
    return (
      <Screen>
        {header}
        <EmptyState
          title="Deposit addresses aren't set up"
          message="Set EXPO_PUBLIC_SDA_SERVER_URL to your SDA server. See docs/SMART_DEPOSIT_ADDRESSES.md."
        />
      </Screen>
    );
  }
  if (!deposit && (loading || recipient.isLoading)) {
    return (
      <Screen>
        {header}
        <LoadingState message="Preparing your deposit address…" />
      </Screen>
    );
  }
  if (!deposit) {
    return (
      <Screen>
        {header}
        <ErrorState message={error ?? 'No deposit address yet'} onRetry={load} />
      </Screen>
    );
  }

  const sources = deposit.sourceChains.filter((id) => id !== deposit.destinationChain);
  const accepted = deposit.accepts
    .filter((t) => sources.includes(t.chain))
    .map((t) => `${tokenLabel(t.symbol)} on ${chainName(t.chain)}`);
  const expires = new Date(deposit.expiry * 1000).toLocaleString();

  return (
    <Screen scroll>
      {header}

      <Text variant="body" color="textSecondary">
        Send from any of these chains, from a wallet or an exchange. It arrives in this wallet on {chainName(deposit.destinationChain)}.
      </Text>

      <View
        style={{
          width: moderateScale(220),
          height: moderateScale(220),
          backgroundColor: '#FFFFFF',
          borderRadius: theme.radii.md,
          borderWidth: 1,
          borderColor: theme.colors.border,
          padding: 14,
          marginVertical: 18,
          alignSelf: 'center',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <QRCode value={deposit.address} size={moderateScale(220) - 28} />
      </View>

      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text variant="small" style={{ marginBottom: 3 }}>Your deposit address</Text>
          <Text variant="mono" mono numberOfLines={1} ellipsizeMode="middle">{deposit.address}</Text>
        </View>
        <Pressable
          onPress={onCopy}
          style={{
            width: moderateScale(36),
            height: moderateScale(36),
            borderRadius: moderateScale(18),
            backgroundColor: theme.colors.brandTint,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {copied ? <Check size={moderateScale(16)} color={theme.colors.brand} /> : <Copy size={moderateScale(16)} color={theme.colors.brand} />}
        </Pressable>
      </Card>

      <Card style={{ marginTop: 12, gap: 4 }}>
        <Text variant="small" color="textSecondary">Accepts</Text>
        <Text variant="body">{accepted.join(', ') || '—'}</Text>
        <Text variant="small" color="textSecondary" style={{ marginTop: 8 }}>Monitored until</Text>
        <Text variant="body">{expires}</Text>
      </Card>

      <View
        style={{
          backgroundColor: theme.colors.brandTint,
          borderRadius: theme.radii.md,
          padding: moderateScale(11),
          marginTop: 12,
          flexDirection: 'row',
          gap: 10,
          alignItems: 'flex-start',
        }}
      >
        <TriangleAlert size={moderateScale(18)} color={theme.colors.brand} style={{ marginTop: 1 }} />
        <Text variant="small" color="textSecondary" style={{ flex: 1 }}>
          Only send the tokens listed above. Other tokens, or amounts below the bridge minimum, are not forwarded: they stay at this address until withdrawn.
        </Text>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 20, marginBottom: 6 }}>
        <Text variant="label" style={{ flex: 1, fontWeight: 'bold' }}>Recent deposits</Text>
        <Pressable onPress={load} hitSlop={10}>
          <RefreshCw size={moderateScale(18)} color={theme.colors.textSecondary} />
        </Pressable>
      </View>
      {transfers.length === 0 ? (
        <Text variant="small" color="textSecondary">No deposits detected yet. They show up here once forwarding starts.</Text>
      ) : (
        transfers.map((t) => (
          <Card key={t.id} style={{ marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="body">From {chainName(t.sourceChainId)}</Text>
            <Text variant="small" color={t.status === 'completed' ? 'brand' : 'textSecondary'}>{t.status}</Text>
          </Card>
        ))
      )}
    </Screen>
  );
}
