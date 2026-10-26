import MorphoProtocolEvm from '@morpho-org/wdk-protocol-lending-morpho-evm'

const RECEIPT_TIMEOUT_MS = 180_000
const RECEIPT_POLL_MS = 2_000

/**
 * Waits until a gasless transaction is mined. The gasless account returns a
 * UserOperation hash, so the receipt is looked up through the account.
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
 * Morpho lending protocol that also accepts the EIP-7702 gasless account.
 *
 * MorphoProtocolEvm only accepts writes from WalletAccountEvm or
 * WalletAccountEvmErc4337 (instanceof checks). The gasless account is neither,
 * and its EOA branch would sign and send locally, which skips sponsorship. So:
 *  - writes are allowed for any account with sendTransaction(), and they go
 *    through that account, so Pimlico sponsors the gas;
 *  - the action methods (deposit, withdraw, supplyCollateral, borrow) send any
 *    approval or authorization transactions first, wait for them to be mined,
 *    then make the call. Requirements that need a signature are refused.
 */
export default class GaslessMorphoProtocol extends MorphoProtocolEvm {
  _assertWritable (method) {
    if (typeof this._evmAccount?.sendTransaction !== 'function') {
      throw new Error(`The '${method}' method requires an account that can send transactions.`)
    }
  }

  async _sendTransaction (prepared) {
    await this._revalidate(prepared.context)
    return await this._evmAccount.sendTransaction(prepared.transaction)
  }

  /** Sends each approval or authorization transaction and waits for it to be mined. */
  async _fulfilRequirements (requirements) {
    for (const requirement of requirements) {
      if (!requirement.to || !requirement.data) {
        throw new Error('This step needs a signature, which the app does not support yet.')
      }
      const { hash } = await this._evmAccount.sendTransaction({
        to: requirement.to,
        data: requirement.data,
        value: BigInt(requirement.value ?? 0),
      })
      await waitForUserOperation(this._evmAccount, hash)
    }
  }

  /** Approves the vault to spend the token, then deposits. */
  async deposit (options) {
    this._assertWritable('deposit')
    const prepared = await this.prepareSupply(options)
    await this._fulfilRequirements(await prepared.getRequirements())
    return await this.supply(options)
  }

  /** Approves and deposits the XAUt collateral of the configured market. */
  async depositCollateral (options) {
    this._assertWritable('depositCollateral')
    await this._fulfilRequirements(await this.getSupplyCollateralRequirements(options))
    return await this.supplyCollateral(options)
  }

  /** Borrows against the collateral. Any authorization is sent first. */
  async borrowAgainstCollateral (options) {
    this._assertWritable('borrow')
    await this._fulfilRequirements(await this.getBorrowRequirements(options))
    return await this.borrow(options)
  }

  /** Withdraws from the vault. Any share approval is sent first. */
  async withdrawFromVault (options) {
    this._assertWritable('withdraw')
    const prepared = await this.prepareWithdraw(options)
    await this._fulfilRequirements(await prepared.getRequirements())
    return await this.withdraw(options)
  }
}
