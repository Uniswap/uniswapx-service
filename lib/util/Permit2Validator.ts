import { ethers } from 'ethers'
import { OrderValidation, UniswapXOrder } from '@uniswap/uniswapx-sdk'
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

    // Construct PermitTransferFrom from order data
    const permitTransferFrom: PermitTransferFrom = {
      permitted: {
        token: order.info.input.token,
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
