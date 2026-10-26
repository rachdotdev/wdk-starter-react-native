import { Stack } from 'expo-router';
import { Toast } from '@/components';

/** Same pattern as the send and swap flows: Toast is mounted inside the modal. */
export default function EarnLayout() {
  return (
    <>
      <Stack screenOptions={{ headerShown: false }} />
      <Toast />
    </>
  );
}
