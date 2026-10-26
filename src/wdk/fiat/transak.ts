import TransakProtocol from '@transak/wdk-protocol-fiat-transak';

/**
 * Transak client for the Buy screen. The widget URL and the order lookup run on
 * the local backend (server/transak-server.mjs), which holds the API secret. The
 * app only sends the public API key and calls the backend.
 */
export function createTransak(): TransakProtocol {
  const backend = process.env.EXPO_PUBLIC_TRANSAK_BACKEND_URL ?? '';

  return new TransakProtocol(undefined, {
    apiKey: process.env.EXPO_PUBLIC_TRANSAK_API_KEY ?? '',
    environment: process.env.EXPO_PUBLIC_TRANSAK_ENV === 'PRODUCTION' ? 'PRODUCTION' : 'STAGING',
    widgetUrl: async (widgetParams) => {
      const res = await fetch(`${backend}/transak/widget-url`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ widgetParams }),
      });
      if (!res.ok) throw new Error(`Could not create the Transak widget (${res.status}).`);
      const { widgetUrl } = await res.json();
      return widgetUrl;
    },
    getOrder: async (txId) => {
      const res = await fetch(`${backend}/transak/order/${encodeURIComponent(txId)}`);
      if (!res.ok) throw new Error(`Could not load the Transak order (${res.status}).`);
      const { order } = await res.json();
      return order;
    },
  });
}
