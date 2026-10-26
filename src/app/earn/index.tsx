import React from 'react';
import { View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, ScreenHeader, Text, Card } from '@/components';
import { useTheme } from '@/theme';
import { useAccounts } from '@/state/accounts';
import { useEarnPositions } from '@/wdk/earn/useMorpho';
import { fromBaseUnits } from '@/wdk/swap';

const DECIMALS = 6;

/**
 * Earn: the Morpho positions for the active account on Ethereum. Tap a card to
 * deposit, withdraw, or borrow against XAUt.
 */
export default function Earn() {
  const router = useRouter();
  const theme = useTheme();
  const { activeIndex } = useAccounts();
  const positions = useEarnPositions(activeIndex);

  const card = (href: string, label: string, value: string | null, unit: string, hint: string) => (
    <Pressable onPress={() => router.push(href as never)} accessibilityRole="button">
      <Card>
        <Text variant="label" color="textSecondary">{label}</Text>
        <Text variant="small" color="textSecondary" style={{ marginTop: 2 }}>Ethereum mainnet</Text>
        <Text variant="tokenName" style={{ marginTop: 4 }}>
          {value !== null ? `${fromBaseUnits(value, DECIMALS)} ${unit}` : '—'}
        </Text>
        <Text variant="small" color="textSecondary" style={{ marginTop: 8 }}>{hint}</Text>
      </Card>
    </Pressable>
  );

  return (
    <Screen scroll edges={['top', 'bottom']}>
      <ScreenHeader title="Earn" onBack={() => router.back()} />
      <Text variant="body" color="textSecondary" style={{ marginBottom: 16 }}>
        Deposit USDT into a vault to earn, or deposit XAUt as collateral to borrow USDT.
      </Text>

      {positions.loading ? <Text variant="small" color="textSecondary">Loading positions…</Text> : null}
      {positions.error ? <Text variant="small" color="error" style={{ marginBottom: 12 }}>{positions.error}</Text> : null}

      {card('/earn/savings', 'sky.money USDT Savings', positions.savings, 'USDT', 'Tap to deposit or withdraw')}
      <View style={{ height: 12 }} />
      {card('/earn/risk', 'sky.money USDT Risk Capital', positions.riskCapital, 'USDT', 'Tap to deposit or withdraw')}
      <View style={{ height: 12 }} />
      {card('/earn/xaut', 'Borrow against XAUt', positions.collateral, 'XAUt', 'Tap to deposit collateral or borrow USDT')}

      <View style={{ height: 8 }} />
      <Text variant="small" color={theme.colors.textSecondary as 'textSecondary'}>
        Borrowing is available once you have XAUt collateral.
      </Text>
    </Screen>
  );
}
