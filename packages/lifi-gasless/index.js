import { LifiSwidgeProtocol } from '@lifi/wdk-protocol-swidge-lifi'

const RECEIPT_TIMEOUT_MS = 180_000
const RECEIPT_POLL_MS = 2_000

/**
 * Waits for a gasless transaction to be mined. The gasless account returns the
 * user operation hash from sendTransaction, which is not an on-chain transaction
 * hash, so the provider's waitForTransaction never resolves for it. Poll the
 * account's receipt lookup instead, with a timeout.
 */
async function waitForUserOperation (account, hash) {
  const deadline = Date.now() + RECEIPT_TIMEOUT_MS
  while (Date.now() < deadline) {
    const receipt = await account.getTransactionReceipt(hash)
    if (receipt) {
      if (receipt.status === 0 || receipt.status === 0n || receipt.status === false) {
        throw new Error(`Transaction ${hash} reverted.`)
      }
      return receipt
    }
    await new Promise(resolve => setTimeout(resolve, RECEIPT_POLL_MS))
  }
  throw new Error(`Timed out waiting for transaction ${hash} to be mined.`)
}

/**
 * LI.FI swap/bridge protocol that also accepts the EIP-7702 gasless account.
 *
 * Two changes from the base class, and nothing else:
 *  - Writes are allowed when the account has sendTransaction(). LifiSwidgeProtocol
 *    only accepts WalletAccountEvm and WalletAccountEvmErc4337 by class name.
 *  - Approval waits use the gasless account's receipt lookup. The base class calls
 *    provider.waitForTransaction on the user operation hash, which never resolves.
 *
 * Route validation, fee caps, minAmountOut, trusted contracts and the approval
 * steps all run as in the base class. Transactions still go through the gasless
 * account, so Pimlico sponsors the gas.
 */
export default class GaslessLifiSwidgeProtocol extends LifiSwidgeProtocol {
  constructor (account, config = {}) {
    super(account, config)

    const provider = this._provider
    if (provider) {
      provider.waitForTransaction = hash => waitForUserOperation(account, hash)
    }
  }

  _isWritableAccount () {
    return typeof this._account?.sendTransaction === 'function'
  }
}
