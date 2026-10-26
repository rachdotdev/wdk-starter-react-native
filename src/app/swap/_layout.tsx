import { Stack } from 'expo-router';
import { Toast } from '@/components';

/**
 * Same pattern as send/_layout.tsx: Toast is mounted inside this nested
 * native modal so it renders above the swap screen, not behind it.
 */
export default function SwapLayout() {
  return (
    <>
      <Stack screenOptions={{ headerShown: false }} />
      <Toast />
    </>
  );
}
