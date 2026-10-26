import React, { useState } from 'react';
import { View, TextInput, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen, ScreenHeader, Text, Card, Button } from '@/components';
import { useTheme } from '@/theme';
import { useResponsive } from '@/theme/responsive';
import { useAccounts } from '@/state/accounts';
import { useEarnPositions } from '@/wdk/earn/useMorpho';
import { useVaultActions } from '@/wdk/earn/useMorphoActions';
import { fromBaseUnits, toBaseUnits } from '@/wdk/swap';

const USDT = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
const XAUT = '0x68749665FF8D2d112Fa859AA293F07A622782F38';
const DECIMALS = 6;

type Vault = 'savings' | 'risk' | 'xaut';
type Pending = { kind: 'deposit' | 'withdraw' | 'depositCollateral' | 'borrow'; amount: string };

const TITLES: Record<Vault, string> = {
  savings: 'sky.money USDT Savings',
  risk: 'sky.money USDT Risk Capital',
  xaut: 'Borrow against XAUt',
};

/**
 * One Earn position. Vaults: deposit, and withdraw once there is a balance.
 * XAUt: deposit collateral, and borrow USDT once there is collateral. Each
 * action shows a summary, and nothing is sent until Confirm.
 */
export default function EarnVault() {
  const { vault } = useLocalSearchParams<{ vault: Vault }>();
  const router = useRouter();
  const theme = useTheme();
  const { moderateScale } = useResponsive();
  const { activeIndex } = useAccounts();
  const positions = useEarnPositions(activeIndex);
  const savingsActions = useVaultActions('morpho-savings', activeIndex);
  const riskActions = useVaultActions('morpho-risk', activeIndex);

  const [amount, setAmount] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const key = (vault ?? 'savings') as Vault;
  const title = TITLES[key] ?? 'Earn';

  const balance =
    key === 'savings' ? positions.savings : key === 'risk' ? positions.riskCapital : positions.collateral;
  const hasBalance = balance !== null && balance !== '0';
  const hasCollateral = positions.collateral !== null && positions.collateral !== '0';

  function prepare(kind: Pending['kind']) {
    setError(null);
    setDone(null);
    const base = toBaseUnits(amount, DECIMALS);
    if (!base) {
      setError('Enter a valid positive amount.');
      return;
    }
    setPending({ kind, amount: base });
  }

  async function confirm() {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      const actions = key === 'risk' ? riskActions : savingsActions;
      let result: { hash: string };
      if (pending.kind === 'deposit') {
        result = await actions.deposit({ token: USDT, amount: Number(pending.amount) });
      } else if (pending.kind === 'withdraw') {
        result = await actions.withdrawFromVault({ token: USDT, amount: Number(pending.amount) });
      } else if (pending.kind === 'depositCollateral') {
        result = await savingsActions.depositCollateral({ amount: Number(pending.amount) });
      } else {
        result = await savingsActions.borrowAgainstCollateral({ token: USDT, amount: Number(pending.amount) });
      }
      setDone(result?.hash ?? 'submitted');
      setPending(null);
      setAmount('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The transaction failed.');
      setPending(null);
    } finally {
      setBusy(false);
    }
  }

  const unit = key === 'xaut' ? 'XAUt' : 'USDT';

  return (
    <Screen scroll edges={['top', 'bottom']}>
      <ScreenHeader title={title} onBack={() => router.back()} />
      <Text variant="small" color="textSecondary" style={{ marginBottom: 12 }}>Network: Ethereum mainnet</Text>

      {key !== 'xaut' ? (
        <Card>
          <Text variant="label" color="textSecondary">Your deposit</Text>
          <Text variant="tokenName" style={{ marginTop: 4 }}>
            {balance !== null ? `${fromBaseUnits(balance, DECIMALS)} USDT` : '—'}
          </Text>
        </Card>
      ) : (
        <Card>
          <Text variant="label" color="textSecondary">Collateral</Text>
          <Text variant="tokenName" style={{ marginTop: 4 }}>
            {positions.collateral !== null ? `${fromBaseUnits(positions.collateral, DECIMALS)} XAUt` : '—'}
          </Text>
          <Text variant="label" color="textSecondary" style={{ marginTop: 12 }}>Borrowed</Text>
          <Text variant="tokenName" style={{ marginTop: 4 }}>
            {positions.borrowed !== null ? `${fromBaseUnits(positions.borrowed, DECIMALS)} USDT` : '—'}
          </Text>
        </Card>
      )}

      <View style={{ height: 16 }} />

      <Text variant="label" color="textSecondary">Amount ({unit})</Text>
      <TextInput
        value={amount}
        onChangeText={(v) => {
          setAmount(v.replace(',', '.'));
          setPending(null);
        }}
        placeholder="0.00"
        placeholderTextColor={theme.colors.textSecondary}
        keyboardType="decimal-pad"
        style={{
          marginTop: 6,
          fontSize: moderateScale(32),
          color: theme.colors.textPrimary,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
          paddingVertical: 8,
        }}
      />

      <View style={{ height: 16, flexDirection: 'row', gap: 8 }} />

      {key === 'xaut' ? (
        <>
          <Button label="Deposit XAUt collateral" onPress={() => prepare('depositCollateral')} disabled={busy} />
          {hasCollateral ? (
            <View style={{ marginTop: 10 }}>
              <Button label="Borrow USDT" variant="secondary" onPress={() => prepare('borrow')} disabled={busy} />
            </View>
          ) : null}
        </>
      ) : (
        <>
          <Button label="Deposit" onPress={() => prepare('deposit')} disabled={busy} />
          {hasBalance ? (
            <View style={{ marginTop: 10 }}>
              <Button label="Withdraw" variant="secondary" onPress={() => prepare('withdraw')} disabled={busy} />
            </View>
          ) : null}
        </>
      )}

      {pending ? (
        <Card style={{ marginTop: 16 }}>
          <Text variant="body">
            {pending.kind === 'deposit' && `Deposit ${fromBaseUnits(pending.amount, DECIMALS)} USDT into ${title}.`}
            {pending.kind === 'withdraw' && `Withdraw ${fromBaseUnits(pending.amount, DECIMALS)} USDT from ${title}.`}
            {pending.kind === 'depositCollateral' && `Deposit ${fromBaseUnits(pending.amount, DECIMALS)} XAUt as collateral.`}
            {pending.kind === 'borrow' && `Borrow ${fromBaseUnits(pending.amount, DECIMALS)} USDT against your XAUt.`}
          </Text>
          <Text variant="small" color="textSecondary" style={{ marginTop: 6 }}>
            Approvals are sent first if needed. Gas is sponsored.
          </Text>
          <View style={{ height: 12 }} />
          <Button label="Confirm" onPress={confirm} loading={busy} disabled={busy} />
          <View style={{ height: 8 }} />
          <Button label="Cancel" variant="secondary" onPress={() => setPending(null)} disabled={busy} />
        </Card>
      ) : null}

      {error ? <Text variant="small" color="error" style={{ marginTop: 12 }}>{error}</Text> : null}
      {done ? <Text variant="small" color="brand" style={{ marginTop: 12 }}>Submitted: {done}</Text> : null}

      <Pressable onPress={() => router.back()} style={{ marginTop: 20, alignSelf: 'center' }}>
        <Text variant="small" color="textSecondary">Back to Earn</Text>
      </Pressable>
    </Screen>
  );
}
