import { CosignedV2DutchOrder, DutchOrder, OrderValidation } from '@uniswap/uniswapx-sdk'
import { ethers } from 'ethers'

// ERC-1271: isValidSignature(bytes32,bytes) returns its own selector for a valid signature.
export const ERC1271_MAGIC_VALUE = '0x1626ba7e'
const ERC1271_INTERFACE = new ethers.utils.Interface([
  'function isValidSignature(bytes32 hash, bytes signature) view returns (bytes4 magicValue)',
])

export type SignatureCheckProvider = Pick<ethers.providers.Provider, 'getCode' | 'call'>

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
 * A provider failure while asking a contract wallet propagates: it is not an answer about the
 * signature, and the caller treats it like any other RPC failure.
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
    try {
      const result = await this.provider.call({
        to: swapper,
        data: ERC1271_INTERFACE.encodeFunctionData('isValidSignature', [digest, signature]),
      })
      // an ABI-encoded bytes4 is left-aligned in one 32-byte word; any other reply is a rejection
      return ethers.utils.hexDataLength(result) >= 32 && ethers.utils.hexDataSlice(result, 0, 4) === ERC1271_MAGIC_VALUE
    } catch (err) {
      // A revert is the contract rejecting the signature; anything else is the RPC failing to
      // answer.
      if (isRevert(err)) {
        return false
      }
      throw err
    }
  }
}

function isRevert(err: unknown): boolean {
  const code = typeof err === 'object' && err !== null && 'code' in err ? Reflect.get(err, 'code') : undefined
  return code === ethers.errors.CALL_EXCEPTION
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
