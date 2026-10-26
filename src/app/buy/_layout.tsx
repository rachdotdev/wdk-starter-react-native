import { Stack } from 'expo-router';
import { Toast } from '@/components';

/** Same pattern as the send, swap and earn flows. */
export default function BuyLayout() {
  return (
    <>
      <Stack screenOptions={{ headerShown: false }} />
      <Toast />
    </>
  );
}
