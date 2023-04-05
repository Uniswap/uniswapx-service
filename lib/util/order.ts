import { DutchLimitOrder, OrderType } from '@uniswap/gouda-sdk'
import { DynamoDBRecord } from 'aws-lambda'
import { OrderEntity, ORDER_STATUS } from '../entities'

type ParsedOrder = {
  encodedOrder: string
  signature: string
  orderHash: string
  orderStatus: ORDER_STATUS
  offerer: string
  createdAt: number
  chainId: number
  filler?: string
  quoteId?: string
}

export const eventRecordToOrder = (record: DynamoDBRecord): ParsedOrder => {
  const newOrder = record?.dynamodb?.NewImage
  if (!newOrder) {
    throw new Error('There is no new order.')
  }

  try {
    return {
      offerer: newOrder.offerer.S as string,
      orderStatus: newOrder.orderStatus.S as ORDER_STATUS,
      encodedOrder: newOrder.encodedOrder.S as string,
      signature: newOrder.signature.S as string,
      createdAt: parseInt(newOrder.createdAt.N as string),
      orderHash: newOrder.orderHash.S as string,
      chainId: parseInt(newOrder.chainId.N as string),
      ...(newOrder?.quoteId?.S && { quoteId: newOrder.quoteId.S as string }),
      ...(newOrder?.filler?.S && { filler: newOrder.filler.S as string }),
    }
  } catch (e) {
    throw new Error(`Error parsing new record to order: ${e instanceof Error ? e.message : e}`)
  }
}

export const formatOrderEntity = (
  decodedOrder: DutchLimitOrder,
  signature: string,
  orderType: OrderType,
  orderStatus: ORDER_STATUS,
  quoteId?: string
): OrderEntity => {
  const { input, outputs } = decodedOrder.info
  const order: OrderEntity = {
    type: orderType,
    encodedOrder: decodedOrder.serialize(),
    signature,
    nonce: decodedOrder.info.nonce.toString(),
    orderHash: decodedOrder.hash().toLowerCase(),
    chainId: decodedOrder.chainId,
    orderStatus: orderStatus,
    offerer: decodedOrder.info.offerer.toLowerCase(),
    input: {
      token: input.token,
      startAmount: input.startAmount.toString(),
      endAmount: input.endAmount.toString(),
    },
    outputs: outputs.map((output) => ({
      token: output.token,
      startAmount: output.startAmount.toString(),
      endAmount: output.endAmount.toString(),
      recipient: output.recipient.toLowerCase(),
      isFeeOutput: output.isFeeOutput,
    })),
    reactor: decodedOrder.info.reactor.toLowerCase(),
    startTime: decodedOrder.info.startTime,
    endTime: decodedOrder.info.deadline,
    deadline: decodedOrder.info.deadline,
    filler: decodedOrder.validation?.data?.filler?.toLowerCase(),
    ...(quoteId && { quoteId: quoteId }),
  }

  return order
}
