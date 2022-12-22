import { DynamoDBRecord } from 'aws-lambda'
import { ORDER_STATUS } from '../entities'

type ParsedOrder = {
  encodedOrder: string
  signature: string
  orderHash: string
  orderStatus: ORDER_STATUS
  offerer: string
  sellToken: string
  filler: string
  createdAt: number
}

export const eventRecordToOrder = (record: DynamoDBRecord): ParsedOrder => {
  const newOrder = record?.dynamodb?.NewImage
  if (!newOrder) {
    throw new Error('There is no new order.')
  }

  return {
    offerer: newOrder.offerer.S as string,
    orderStatus: newOrder.orderStatus.S as ORDER_STATUS,
    filler: newOrder.filler.S as string,
    sellToken: newOrder.sellToken.S as string,
    encodedOrder: newOrder.encodedOrder.S as string,
    signature: newOrder.signature.S as string,
    createdAt: parseInt(newOrder.createdAt.N as string),
    orderHash: newOrder.orderHash.S as string,
  }
}
