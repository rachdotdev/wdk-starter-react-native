import { test } from 'node:test'
import assert from 'node:assert/strict'
import { API_URL, installMock } from './mock-candide.js'
import { createSdaService, InputError } from '../sda.js'

const env = {
  CANDIDE_FORWARDING_API_URL: API_URL,
  CANDIDE_FORWARDING_POLICY_SECRET: 'policy-secret',
  SDA_SALT_SECRET: '0x' + 'ab'.repeat(32),
  SDA_DESTINATION_CHAIN: 'arbitrum',
  SDA_SOURCE_CHAINS: 'ethereum,polygon',
  SDA_RENEW_WITHIN_SECONDS: '86400'
}
const USER = '0x1111111111111111111111111111111111111111'
const OTHER = '0x2222222222222222222222222222222222222222'

test('activates on first request, renews only when expiry is close', async () => {
  const mock = installMock({ ttlSeconds: 3600 }) // 1 h left: inside the 24 h renew window
  try {
    const service = createSdaService(env)
    const first = await service.getLiveDepositAddress(USER)
    assert.deepEqual(first.sourceChains, [1, 137, 42161])
    assert.equal(first.destinationChain, 42161)
    assert.ok(first.expiry > Date.now() / 1000)
    assert.ok(first.accepts.some((t) => t.chain === 137 && t.symbol === 'USDT'))
    assert.ok(first.accepts.every((t) => ['USDT', 'USDT0', 'XAUT0'].includes(t.symbol))) // non-Tether tokens filtered out
    const activations = mock.calls.filter((c) => c.method === 'account_activateForwardingAddress')
    assert.equal(activations.length, 2) // create, then renew because 1 h < 24 h
    assert.ok(activations.every((c) => c.auth))

    const again = await service.getLiveDepositAddress(USER.toUpperCase().replace('0X', '0x'))
    assert.equal(again.address, first.address) // same user, same address
  } finally { mock.restore() }
})

test('does not renew when plenty of monitoring is left', async () => {
  const mock = installMock({ ttlSeconds: 7 * 24 * 3600 })
  try {
    const service = createSdaService(env)
    await service.getLiveDepositAddress(USER)
    await service.getLiveDepositAddress(USER)
    assert.equal(mock.calls.filter((c) => c.method === 'account_activateForwardingAddress').length, 1)
  } finally { mock.restore() }
})

test('different users and different salt secrets give different addresses', async () => {
  const mock = installMock()
  try {
    const a = await createSdaService(env).getLiveDepositAddress(USER)
    const b = await createSdaService(env).getLiveDepositAddress(OTHER)
    const c = await createSdaService({ ...env, SDA_SALT_SECRET: '0x' + 'cd'.repeat(32) }).getLiveDepositAddress(USER)
    assert.notEqual(a.address, b.address)
    assert.notEqual(a.address, c.address)
  } finally { mock.restore() }
})

test('lists transfers for the user', async () => {
  const mock = installMock()
  try {
    const service = createSdaService(env)
    await service.getLiveDepositAddress(USER)
    const transfers = await service.getTransfers(USER)
    assert.equal(transfers.length, 1)
    assert.equal(transfers[0].status, 'completed')
  } finally { mock.restore() }
})

test('rejects bad input and missing config', async () => {
  const service = createSdaService(env)
  await assert.rejects(service.getLiveDepositAddress('not-an-address'), InputError)
  assert.throws(() => createSdaService({ ...env, CANDIDE_FORWARDING_POLICY_SECRET: '' }), /Missing/)
  assert.throws(() => createSdaService({ ...env, SDA_SALT_SECRET: '0x1234' }), /32 bytes/)
})
