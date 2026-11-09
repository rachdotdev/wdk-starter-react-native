import React, { useMemo, useRef, useState } from 'react';
import { View, ScrollView, TextInput, Pressable, ActivityIndicator } from 'react-native';
import { Sparkles, Send, Trash2 } from 'lucide-react-native';
import { Screen, Text, Button, Card } from '@/components';
import { useTheme } from '@/theme';
import { useResponsive } from '@/theme/responsive';
import { useWdkAccount, useWdkBalances, useWdkTotalUsd, useWdkTransactions } from '@/wdk/hooks/useWalletData';
import { useAssistant } from '@/ai/assistant';
import { buildWalletSystemPrompt } from '@/ai/walletContext';

/**
 * Assistant — QVAC proof of concept. A chat with a small LLM (Llama 3.2 1B)
 * that runs ON the phone via QVAC. It is given a read-only summary of the
 * active account (balances + recent transfers), so it can answer "how much
 * USDT do I have on Polygon?" or "what was my last transaction?" and explain
 * crypto concepts — without any wallet data leaving the device.
 *
 * QVAC needs a physical device (llama.cpp doesn't run on emulators/simulators)
 * and a one-time model download (~770 MB).
 */

const SUGGESTIONS = [
  'Summarize my balances',
  'What was my last transaction?',
  'What is a seed phrase and why must I keep it secret?',
];

export default function AssistantScreen() {
  const theme = useTheme();
  const { moderateScale } = useResponsive();
  const scrollRef = useRef<ScrollView>(null);
  const [input, setInput] = useState('');

  const account = useWdkAccount();
  const balances = useWdkBalances();
  const { total } = useWdkTotalUsd();
  const transactions = useWdkTransactions();

  const status = useAssistant((s) => s.status);
  const progress = useAssistant((s) => s.progress);
  const downloadedMb = useAssistant((s) => s.downloadedMb);
  const totalMb = useAssistant((s) => s.totalMb);
  const error = useAssistant((s) => s.error);
  const messages = useAssistant((s) => s.messages);
  const generating = useAssistant((s) => s.generating);
  const loadModel = useAssistant((s) => s.loadModel);
  const unloadModel = useAssistant((s) => s.unloadModel);
  const ask = useAssistant((s) => s.ask);
  const clearChat = useAssistant((s) => s.clearChat);

  const systemPrompt = useMemo(
    () =>
      buildWalletSystemPrompt({
        account: account.data,
        totalUsd: total,
        balances: balances.data ?? [],
        transactions: transactions.data ?? [],
      }),
    [account.data, total, balances.data, transactions.data],
  );

  const send = (text: string) => {
    const question = text.trim();
    if (!question || generating) return;
    setInput('');
    ask(question, systemPrompt);
  };

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Sparkles size={moderateScale(20)} color={theme.colors.brand} />
        <Text variant="headTitle">Assistant</Text>
      </View>
      {status === 'ready' && messages.length > 0 ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Clear chat" onPress={clearChat} hitSlop={10}>
          <Trash2 size={moderateScale(18)} color={theme.colors.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  );

  if (status !== 'ready') {
    const busy = status === 'downloading' || status === 'loading';
    return (
      <Screen edges={['top']}>
        {header}
        <Card>
          <Text variant="tokenName">On-device AI, powered by QVAC</Text>
          <Text color="textSecondary" style={{ marginTop: 6 }}>
            Ask about your balances and activity, or about crypto in general. The model runs entirely on this
            phone, so your wallet data never leaves it. It can't send or sign anything.
          </Text>
          <Text variant="small" color="textSecondary" style={{ marginTop: 10 }}>
            First use downloads Llama 3.2 1B (about 770 MB). Wi-Fi recommended.
          </Text>
        </Card>

        <View style={{ marginTop: 20 }}>
          {status === 'downloading' ? (
            <View style={{ marginBottom: 14 }}>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: theme.colors.border, overflow: 'hidden' }}>
                <View style={{ width: `${Math.min(100, progress)}%`, height: 6, backgroundColor: theme.colors.brand }} />
              </View>
              <Text variant="small" color="textSecondary" style={{ marginTop: 6 }}>
                Downloading {progress.toFixed(0)}% ({downloadedMb.toFixed(0)}/{totalMb.toFixed(0)} MB)
              </Text>
            </View>
          ) : null}
          {status === 'error' ? (
            <Text color="error" style={{ marginBottom: 14 }}>
              Couldn't start the assistant: {error}
            </Text>
          ) : null}
          <Button
            label={status === 'error' ? 'Try again' : busy ? 'Starting assistant…' : 'Start assistant'}
            onPress={loadModel}
            loading={busy}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={['top']}>
      {header}
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ gap: 10, paddingBottom: 12 }}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        keyboardShouldPersistTaps="handled"
      >
        {messages.length === 0 ? (
          <View style={{ gap: 8 }}>
            <Text color="textSecondary">Try asking:</Text>
            {SUGGESTIONS.map((s) => (
              <Pressable
                key={s}
                onPress={() => send(s)}
                style={{
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  borderRadius: theme.radii.md,
                  padding: 12,
                }}
              >
                <Text>{s}</Text>
              </Pressable>
            ))}
          </View>
        ) : (
          messages.map((m, i) => {
            const mine = m.role === 'user';
            return (
              <View
                key={i}
                style={{
                  alignSelf: mine ? 'flex-end' : 'flex-start',
                  maxWidth: '85%',
                  backgroundColor: mine ? theme.colors.brand : theme.colors.bgSecondary,
                  borderColor: theme.colors.border,
                  borderWidth: mine ? 0 : 1,
                  borderRadius: theme.radii.lg,
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                }}
              >
                {m.content ? (
                  <Text color={mine ? 'white' : 'textPrimary'}>{m.content}</Text>
                ) : (
                  <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 8 }}>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Ask about your wallet…"
          placeholderTextColor={theme.colors.textSecondary}
          onSubmitEditing={() => send(input)}
          returnKeyType="send"
          editable={!generating}
          style={{
            flex: 1,
            fontSize: moderateScale(15),
            color: theme.colors.textPrimary,
            backgroundColor: theme.colors.bgSecondary,
            borderColor: theme.colors.border,
            borderWidth: 1,
            borderRadius: theme.radii.pill,
            paddingHorizontal: 16,
            paddingVertical: 10,
          }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send"
          onPress={() => send(input)}
          disabled={generating || !input.trim()}
          style={{
            width: moderateScale(42),
            height: moderateScale(42),
            borderRadius: moderateScale(21),
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: generating || !input.trim() ? theme.colors.disabledBg : theme.colors.brand,
          }}
        >
          {generating ? (
            <ActivityIndicator size="small" color={theme.colors.white} />
          ) : (
            <Send size={moderateScale(18)} color={theme.colors.white} />
          )}
        </Pressable>
      </View>
      <Pressable onPress={unloadModel} style={{ alignSelf: 'center', paddingTop: 8 }}>
        <Text variant="small" color="textSecondary">
          Stop assistant (frees memory)
        </Text>
      </Pressable>
    </Screen>
  );
}
