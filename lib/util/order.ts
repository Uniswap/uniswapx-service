import { UniswapXOrderParser } from '@uniswap/uniswapx-sdk'
import { DynamoDBRecord } from 'aws-lambda'
import { ORDER_STATUS } from '../entities'

export const DUTCH_LIMIT = 'DutchLimit'

type ParsedOrder = {
  encodedOrder: string
  signature: string
  orderHash: string
  orderStatus: ORDER_STATUS
  swapper: string
  createdAt: number
  chainId: number
  filler?: string
  quoteId?: string
  orderType?: string
}

export const eventRecordToOrder = (record: DynamoDBRecord): ParsedOrder => {
  const newOrder = record?.dynamodb?.NewImage
  if (!newOrder) {
    throw new Error('There is no new order.')
  }

  try {
    const chainId = parseInt(newOrder.chainId.N as string)
    const encodedOrder = newOrder.encodedOrder.S as string
    const orderType = new UniswapXOrderParser().getOrderTypeFromEncoded(encodedOrder, chainId)

    return {
      swapper: newOrder.offerer.S as string,
      orderStatus: newOrder.orderStatus.S as ORDER_STATUS,
      encodedOrder: encodedOrder,
      signature: newOrder.signature.S as string,
      createdAt: parseInt(newOrder.createdAt.N as string),
      orderHash: newOrder.orderHash.S as string,
      chainId: chainId,
      orderType: orderType,
      ...(newOrder?.quoteId?.S && { quoteId: newOrder.quoteId.S as string }),
      ...(newOrder?.filler?.S && { filler: newOrder.filler.S as string }),
    }
  } catch (e) {
    throw new Error(`Error parsing new record to order: ${e instanceof Error ? e.message : e}`)
  }
}
