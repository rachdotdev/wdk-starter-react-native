import { Stack } from 'expo-router';
import { Toast } from '@/components';

/** Full-screen modal, same setup as receive/_layout.tsx. */
export default function DepositLayout() {
  return (
    <>
      <Stack screenOptions={{ headerShown: false }} />
      <Toast />
    </>
  );
}
