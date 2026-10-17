import { CosignedV2DutchOrder, DutchOrder, OrderValidation } from '@uniswap/uniswapx-sdk'
import { ethers } from 'ethers'

// ERC-1271: isValidSignature(bytes32,bytes) returns its own selector for a valid signature.
const ERC1271_MAGIC_VALUE = '0x1626ba7e'
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
      const [magicValue] = ERC1271_INTERFACE.decodeFunctionResult('isValidSignature', result)
      return magicValue === ERC1271_MAGIC_VALUE
    } catch {
      return false
    }
  }
}

// undefined for a signature ecrecover cannot parse (wrong length, s out of range, ...).
function recoveredSigner(order: DutchOrder | CosignedV2DutchOrder, signature: string): string | undefined {
  try {
    return order.getSigner(signature)
  } catch {
    return undefined
  }
}

function cosignedByOrderCosigner(order: CosignedV2DutchOrder): boolean {
  try {
    const cosigner = ethers.utils.recoverAddress(order.cosignatureHash(order.info.cosignerData), order.info.cosignature)
    return cosigner.toLowerCase() === order.info.cosigner.toLowerCase()
  } catch {
    return false
  }
}
