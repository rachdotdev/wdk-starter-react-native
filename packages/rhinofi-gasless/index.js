import { RhinofiProtocol } from '@rhino.fi/wdk-protocol-swidge-rhinofi'

/**
 * The Bare runtime has no FormData, but the fetch implementation Rhino.fi's SDK
 * uses builds one to parse form and multipart responses. Define a minimal one
 * when it is missing. It only needs the methods that parser calls, plus
 * iteration.
 */
if (typeof globalThis.FormData === 'undefined') {
  globalThis.FormData = class FormData {
    #entries = []

    append (name, value) {
      this.#entries.push([String(name), value])
    }

    set (name, value) {
      this.delete(name)
      this.append(name, value)
    }

    get (name) {
      const entry = this.#entries.find(([key]) => key === String(name))
      return entry ? entry[1] : null
    }

    getAll (name) {
      return this.#entries.filter(([key]) => key === String(name)).map(([, value]) => value)
    }

    has (name) {
      return this.#entries.some(([key]) => key === String(name))
    }

    delete (name) {
      this.#entries = this.#entries.filter(([key]) => key !== String(name))
    }

    forEach (callback, thisArg) {
      for (const [key, value] of this.#entries) callback.call(thisArg, value, key, this)
    }

    * entries () {
      yield * this.#entries
    }

    * keys () {
      for (const [key] of this.#entries) yield key
    }

    * values () {
      for (const [, value] of this.#entries) yield value
    }

    [Symbol.iterator] () {
      return this.entries()
    }
  }
}

/**
 * Rhino.fi swap/bridge protocol that also accepts the EIP-7702 gasless account.
 *
 * RhinofiProtocol only accepts accounts whose class chain includes
 * WalletAccountEvm, WalletAccountEvmErc4337, WalletAccountSolana or
 * WalletAccountTron. The gasless account is none of these, so execution is
 * rejected before anything is sent. The gasless account does expose
 * sendTransaction(), which is the only write the EVM path needs, so this
 * override accepts any account that has it. Quoting, validation, fee limits and
 * execution stay as in the base class. Transactions still go through the gasless
 * account, so Pimlico sponsors the gas.
 */
export default class GaslessRhinofiProtocol extends RhinofiProtocol {
  _requireFullAccount (operation) {
    const account = this._account
    if (typeof account?.sendTransaction !== 'function') {
      throw new Error(`A wallet account that can send transactions is required to ${operation}.`)
    }
    return account
  }
}
