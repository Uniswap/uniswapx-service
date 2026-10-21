import { CosignedV2DutchOrder, DutchOrder } from '@uniswap/uniswapx-sdk'
import { ethers, Wallet } from 'ethers'

/** The swapper's Permit2 signature over `order`, as a wallet produces it for the app. */
export async function signOrder(order: DutchOrder | CosignedV2DutchOrder, swapper: Wallet): Promise<string> {
  const { domain, types, values } = order.permitData()
  return swapper._signTypedData(domain, types, values)
}

/**
 * `order` with its cosignature replaced by `cosigner`'s: a raw signature over cosignatureHash,
 * as the parameterization API's KMS cosigner produces it and the reactor's CosignerLib
 * verifies it (no EIP-191 prefix).
 */
export async function cosignOrder(order: CosignedV2DutchOrder, cosigner: Wallet): Promise<CosignedV2DutchOrder> {
  const cosignature = ethers.utils.joinSignature(
    cosigner._signingKey().signDigest(order.cosignatureHash(order.info.cosignerData))
  )
  return new CosignedV2DutchOrder({ ...order.info, cosignature }, order.chainId)
}
