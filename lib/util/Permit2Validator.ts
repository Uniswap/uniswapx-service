import { ethers } from 'ethers'
import { 
  OrderValidation, 
  UniswapXOrder, 
  DutchOrder, 
  CosignedV2DutchOrder, 
  CosignedV3DutchOrder, 
  CosignedPriorityOrder,
  CosignedHybridOrder 
} from '@uniswap/uniswapx-sdk'
import { ChainId } from './chain'
import { permit2Address, SignatureProvider, PermitTransferFrom, TokenPermissions } from '@uniswap/permit2-sdk'

export interface ValidationContext {
  chainId: ChainId
  currentBlock: number
  currentTimestamp: number
  provider: ethers.providers.Provider
}

/**
 * Permit2Validator performs on-chain validation checks for UniswapX orders.
 * It checks for Expired and NonceUsed conditions.
 * 
 * This validator is designed to be used in scenarios where the OrderQuoter is not
 * usable (e.g. for permissioned tokens).
 */
export class Permit2Validator {
  private provider: ethers.providers.Provider
  private chainId: ChainId

  constructor(provider: ethers.providers.Provider, chainId: ChainId) {
    this.provider = provider
    this.chainId = chainId
  }

  /**
   * Validates an order for all supported validation checks
   * @param order - The UniswapX order to validate
   * @returns Promise<ValidationResult>
   */
  public async validate(
    order: UniswapXOrder
  ): Promise<OrderValidation> {

    // Check if order deadline has passed
    const currentTimestamp = Math.floor(Date.now() / 1000)
    if (currentTimestamp > order.info.deadline) {
      return OrderValidation.Expired
    }

    const address = permit2Address(this.chainId)
    const signatureProvider = new SignatureProvider(this.provider, address)
    // Type for legacy orders that have input at the info level
    type LegacyUniswapXOrder = DutchOrder | CosignedV2DutchOrder | CosignedV3DutchOrder | CosignedPriorityOrder
    // Get input token from the order (handles both legacy and v4 orders)
    const token = order instanceof CosignedHybridOrder ? order.info.input.token : (order as LegacyUniswapXOrder).info.input.token

    // Validate each input token
      const permitTransferFrom: PermitTransferFrom = {
        permitted: {
          token,
          amount: 0 // Amount is not used in validation
        } as TokenPermissions,
        spender: order.info.swapper,
        nonce: order.info.nonce,
        deadline: order.info.deadline
      }

      const permitValidation = await signatureProvider.validatePermit(permitTransferFrom)

      if (permitValidation.isUsed) {
        return OrderValidation.NonceUsed
      }

      if (permitValidation.isExpired) {
        return OrderValidation.Expired
      }

    return OrderValidation.OK
  }
}
