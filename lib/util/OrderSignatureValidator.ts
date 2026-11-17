import { CosignedV2DutchOrder, DutchOrder, OrderValidation } from '@uniswap/uniswapx-sdk'
import { ethers } from 'ethers'

// ERC-1271: isValidSignature(bytes32,bytes) returns its own selector for a valid signature.
export const ERC1271_MAGIC_VALUE = '0x1626ba7e'
export const ERC1271_INTERFACE = new ethers.utils.Interface([
  'function isValidSignature(bytes32 hash, bytes signature) view returns (bytes4 magicValue)',
])

// Whether an isValidSignature reply is the magic value: an ABI-encoded bytes4 is left-aligned in one
// 32-byte word; any other reply is a rejection.
export function isErc1271MagicValue(result: string): boolean {
  return ethers.utils.hexDataLength(result) >= 32 && ethers.utils.hexDataSlice(result, 0, 4) === ERC1271_MAGIC_VALUE
}

export type SignatureCheckProvider = Pick<ethers.providers.JsonRpcProvider, 'getCode' | 'send'>

/**
 * Authenticates an order offchain the way the reactor and Permit2 do onchain, for orders the
 * order quoter cannot simulate (permissioned input tokens).
 *
 * - Swapper signature, as Permit2's SignatureVerification checks it: a swapper without code
 *   must be the ECDSA signer of the Permit2 typed data (65-byte or EIP-2098 64-byte
 *   signature); a swapper with code must answer isValidSignature(digest, signature) with the
 *   ERC-1271 magic value.
 * - V2 cosignature, as CosignerLib checks it: a raw ecrecover over cosignatureHash must yield
 *   the order's cosigner. Whether that cosigner is the expected one is the offchain
 *   validator's check.
 *
 * Asking a contract wallet ends one of three ways. It returns, and the reply is judged. It
 * reverts, which is a refusal, whatever data the revert carries: Permit2 reverts with it
 * onchain. Or the node never gives an answer (a timeout, an HTTP error, a rate limit, an
 * internal error), which says nothing about the signature: that failure propagates, and the
 * caller treats it like any other RPC failure.
 */
export class OrderSignatureValidator {
  constructor(private readonly provider: SignatureCheckProvider) {}

  async validate(order: DutchOrder | CosignedV2DutchOrder, signature: string): Promise<OrderValidation> {
    if (order instanceof CosignedV2DutchOrder && !cosignedByOrderCosigner(order)) {
      return OrderValidation.InvalidCosignature
    }
    return (await this.signedBySwapper(order, signature)) ? OrderValidation.OK : OrderValidation.InvalidSignature
  }

  private async signedBySwapper(order: DutchOrder | CosignedV2DutchOrder, signature: string): Promise<boolean> {
    const swapper = order.info.swapper
    const code = await this.provider.getCode(swapper)
    if (code === '0x') {
      return recoveredSigner(order, signature)?.toLowerCase() === swapper.toLowerCase()
    }
    const { domain, types, values } = order.permitData()
    const digest = ethers.utils._TypedDataEncoder.hash(domain, types, values)
    const data = ERC1271_INTERFACE.encodeFunctionData('isValidSignature', [digest, signature])
    let result: unknown
    try {
      // The raw eth_call, not provider.call: that one hands a revert's data back as the call's
      // result and gives every failure the code of a revert, so the three outcomes look alike.
      result = await this.provider.send('eth_call', [{ to: swapper, data }, 'latest'])
    } catch (err) {
      if (isNodeRevert(err)) {
        return false
      }
      throw err
    }
    if (typeof result !== 'string') {
      throw new Error('eth_call returned no data for isValidSignature')
    }
    return isErc1271MagicValue(result)
  }
}

// How deep to follow an error's `error` causes; ethers nests two or three.
const MAX_CAUSE_DEPTH = 5

/**
 * Whether an error from the provider is the node itself saying the call reverted: a JSON-RPC
 * error (numeric code) whose message says so, found on the error or among its `error` causes,
 * where ethers puts it. A timeout, a network error, an HTTP error and any other JSON-RPC error
 * (a rate limit, say) are not reverts.
 */
export function isNodeRevert(err: unknown): boolean {
  let cause = err
  for (let depth = 0; depth <= MAX_CAUSE_DEPTH && cause !== undefined; depth++) {
    const message = field(cause, 'message')
    if (typeof field(cause, 'code') === 'number' && typeof message === 'string' && /revert/i.test(message)) {
      return true
    }
    cause = field(cause, 'error')
  }
  return false
}

function field(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined
}

/**
 * Whether ecrecover onchain can recover anything from `signature`. Permit2 and CosignerLib
 * take v as the raw 65th byte, and ecrecover yields address(0) for anything but 27 or 28;
 * ethers would normalise 0 and 1 and accept a signature the chain rejects. Permit2 also
 * accepts the EIP-2098 compact form; CosignerLib reads byte 64 and so does not.
 */
function recoverableOnChain(signature: string, { allowCompact }: { allowCompact: boolean }): boolean {
  const bytes = ethers.utils.arrayify(signature)
  if (bytes.length === 64) {
    return allowCompact
  }
  return bytes.length === 65 && (bytes[64] === 27 || bytes[64] === 28)
}

// undefined for a signature ecrecover cannot use (wrong length, v, or s range, bad hex).
function recoveredSigner(order: DutchOrder | CosignedV2DutchOrder, signature: string): string | undefined {
  try {
    return recoverableOnChain(signature, { allowCompact: true }) ? order.getSigner(signature) : undefined
  } catch {
    return undefined
  }
}

function cosignedByOrderCosigner(order: CosignedV2DutchOrder): boolean {
  try {
    if (!recoverableOnChain(order.info.cosignature, { allowCompact: false })) {
      return false
    }
    const cosigner = ethers.utils.recoverAddress(order.cosignatureHash(order.info.cosignerData), order.info.cosignature)
    return cosigner.toLowerCase() === order.info.cosigner.toLowerCase()
  } catch {
    return false
  }
}
