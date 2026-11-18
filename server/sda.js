import CandideForwardingProtocol from '@candidelabs/wdk-protocol-sda-candide'
import { NoSuchElementError } from '@tetherto/wdk-wallet/protocols'
import { keccak256, solidityPacked, isAddress, getAddress } from 'ethers'

/**
 * Wraps the Candide SDA module for the app. One instance holds the policy secret; nothing here signs
 * or moves funds.
 */
export function createSdaService (env = process.env) {
  const required = ['CANDIDE_FORWARDING_API_URL', 'CANDIDE_FORWARDING_POLICY_SECRET', 'SDA_SALT_SECRET']
  const missing = required.filter((name) => !env[name])
  if (missing.length > 0) throw new Error(`Missing environment variables: ${missing.join(', ')}`)
  if (!/^0x[0-9a-fA-F]{64}$/.test(env.SDA_SALT_SECRET)) throw new Error('SDA_SALT_SECRET must be 32 bytes of hex with a 0x prefix')

  const destinationChain = env.SDA_DESTINATION_CHAIN || 'arbitrum'
  const sourceChains = (env.SDA_SOURCE_CHAINS || 'ethereum,polygon').split(',').map((chain) => chain.trim()).filter(Boolean)
  const renewWithin = Number(env.SDA_RENEW_WITHIN_SECONDS || 24 * 60 * 60)
  // Only Tether assets are shown to users, whatever else the Candide policy forwards.
  const acceptedSymbols = new Set((env.SDA_ACCEPTED_SYMBOLS || 'USDT,USDT0,XAUT0').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean))

  const sda = new CandideForwardingProtocol(undefined, {
    apiUrl: env.CANDIDE_FORWARDING_API_URL,
    policySecret: env.CANDIDE_FORWARDING_POLICY_SECRET,
    ...(env.CANDIDE_RECOVERY_WITHDRAWER ? { recoveryWithdrawer: env.CANDIDE_RECOVERY_WITHDRAWER } : {})
  })

  // keccak256(serverSecret, recipient): one stable address per user, not derivable by anyone who only knows
  // the user's public wallet address.
  const saltFor = (recipient) => keccak256(solidityPacked(['bytes32', 'address'], [env.SDA_SALT_SECRET, recipient]))

  const toResponse = (descriptor) => ({
    address: descriptor.address,
    expiry: descriptor.expiry,
    sourceChains: descriptor.sourceChains,
    destinationChain: descriptor.destinationChain,
    recipient: descriptor.destinationAddress,
    accepts: descriptor.supportedInputTokens.filter((token) => acceptedSymbols.has(String(token.symbol).toUpperCase())).map((token) => ({
      chain: token.chain,
      symbol: token.symbol,
      token: token.token,
      decimals: token.decimals
    }))
  })

  return {
    /**
     * Returns the user's deposit address, live. Activates it the first time, renews it only when expiry is
     * close, and never returns an address whose monitoring has lapsed.
     */
    async getLiveDepositAddress (recipientInput) {
      if (!isAddress(recipientInput)) throw new InputError('recipient must be an EVM address')
      const recipient = getAddress(recipientInput)
      const options = { sourceChains, destinationChain, destinationAddress: recipient, salt: saltFor(recipient) }

      const address = await sda.deriveDepositAddress(options)
      const now = Math.floor(Date.now() / 1000)

      let current
      try {
        current = await sda.getDepositAddress(address)
      } catch (error) {
        if (!(error instanceof NoSuchElementError)) throw error
        ;[current] = await sda.createDepositAddress(options)
      }

      if (!current.expiry || current.expiry - now < renewWithin) {
        current = await sda.renewDepositAddress(address)
      }

      if (!current.expiry || current.expiry <= Math.floor(Date.now() / 1000)) {
        throw new Error('Monitoring is not active for this address')
      }
      if (current.address !== address) throw new Error('Deposit address mismatch')

      return toResponse(current)
    },

    /** Recent forwards through the user's deposit address, newest first. */
    async getTransfers (recipientInput, { limit = 20 } = {}) {
      if (!isAddress(recipientInput)) throw new InputError('recipient must be an EVM address')
      const recipient = getAddress(recipientInput)
      const address = await sda.deriveDepositAddress({ sourceChains, destinationChain, destinationAddress: recipient, salt: saltFor(recipient) })
      const transfers = await sda.getTransfers(address, { limit })
      return transfers.map((transfer) => ({
        id: transfer.id,
        status: transfer.status,
        providerStatus: transfer.providerStatus,
        sourceChainId: transfer.sourceChainId,
        destinationChainId: transfer.destinationChainId,
        sourceTxHash: transfer.sourceTxHash,
        destinationTxHash: transfer.destinationTxHash,
        sourceAddresses: transfer.sourceAddresses
      }))
    }
  }
}

export class InputError extends Error {}
