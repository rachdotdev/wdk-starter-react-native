// In-memory JSON-RPC mock of the Candide Forwarding API for tests. Response shapes follow the
// @candidelabs/wdk-protocol-sda-candide unit-test fixtures. Nothing here touches a live API.
import { PINNED_DEPLOY_PARAMS, computeProxyAddress } from '@candidelabs/wdk-protocol-sda-candide'

export const API_URL = 'https://api.example/forwarder/v3/test-key'
const RELAYER = '0x3333333333333333333333333333333333333333'
const USDT0_ARB = '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9'
const ROUTES = {
  1: [{ sourceChainId: 1, destinationChainId: 42161, tokens: [{ address: '0xdac17f958d2ee523a2206206994597c13d831ec7', symbol: 'USDT', decimals: 6, destinationAddress: USDT0_ARB, feeBps: 20 }] }],
  137: [{ sourceChainId: 137, destinationChainId: 42161, tokens: [{ address: '0x0000000000000000000000000000000000000abc', symbol: 'OTHER', decimals: 6, destinationAddress: USDT0_ARB, feeBps: 20 }, { address: '0xc2132d05d31c914a87c6611c10748aeb04b58e8f', symbol: 'USDT', decimals: 6, destinationAddress: USDT0_ARB, feeBps: 20 }] }],
  42161: [{ sourceChainId: 42161, destinationChainId: 42161, tokens: [{ address: USDT0_ARB, symbol: 'USDT0', decimals: 6, destinationAddress: USDT0_ARB, feeBps: 0 }] }]
}

export function installMock ({ ttlSeconds = 3600 } = {}) {
  const now = () => Math.floor(Date.now() / 1000)
  const addresses = new Map()
  const calls = []
  const notFound = () => { const e = new Error('not found'); e.rpc = { code: -32005, message: 'address not found' }; throw e }
  const handlers = {
    forwarding_getDeployParams: () => ({ ...PINNED_DEPLOY_PARAMS, allowedRelayer: RELAYER }),
    forwarding_getRoutes: ({ sourceChainId }) => ({ routes: ROUTES[sourceChainId] ?? [] }),
    account_activateForwardingAddress: (p) => {
      const stored = { ...PINNED_DEPLOY_PARAMS, allowedRelayer: RELAYER, recipient: p.recipient, custodialWithdrawer: p.custodialWithdrawer, destinationChainId: p.destinationChainId, salt: p.salt }
      const address = computeProxyAddress({ ...stored, recoveryWithdrawer: p.custodialWithdrawer })
      addresses.set(address, { stored, chains: p.sourceChainIds.map((id) => ({ sourceChainId: id, expiresAt: now() + ttlSeconds })) })
      return { address, expiresAt: now() + ttlSeconds }
    },
    forwarding_getDeployParamsByAddress: ({ address }) => addresses.get(address)?.stored ?? notFound(),
    forwarding_getActivation: ({ address }) => (addresses.has(address) ? { sourceChains: addresses.get(address).chains } : notFound()),
    forwarding_getForwardsByRecipient: ({ recipient }) => ({
      forwards: [...addresses.entries()].filter(([, v]) => v.stored.recipient === recipient).map(([address]) => ({
        forwardId: 'fwd_1', status: 'delivered', proxyAddress: address, recipient, sourceChainId: 137, sourceTxHash: '0xabc', destinationChainId: 42161, destinationTxHash: '0xdef', sourceAddresses: [{ address: '0x9999999999999999999999999999999999999999', amount: '25000000' }]
      }))
    })
  }
  const realFetch = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    if (String(url) !== API_URL) return realFetch(url, init)
    const { id, method, params } = JSON.parse(init.body)
    calls.push({ method, auth: Boolean(init.headers.authorization) })
    try {
      return new Response(JSON.stringify({ jsonrpc: '2.0', id, result: handlers[method](params[0]) }), { status: 200 })
    } catch (e) {
      if (!e.rpc) throw e
      return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: e.rpc }), { status: 200 })
    }
  }
  return { calls, addresses, restore: () => { globalThis.fetch = realFetch } }
}
