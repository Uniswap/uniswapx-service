import { CosignedV2DutchOrder, CosignerData, DutchOrder, OrderType, UniswapXOrderParser } from '@uniswap/uniswapx-sdk'
import { DynamoDBRecord } from 'aws-lambda'
import { ORDER_STATUS, UniswapXOrderEntity } from '../entities'

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

export const formatOrderEntity = (
  decodedOrder: DutchOrder,
  signature: string,
  orderType: OrderType,
  orderStatus: ORDER_STATUS,
  quoteId?: string
): UniswapXOrderEntity => {
  const { input, outputs } = decodedOrder.info
  const order: UniswapXOrderEntity = {
    type: orderType,
    encodedOrder: decodedOrder.serialize(),
    signature,
    nonce: decodedOrder.info.nonce.toString(),
    orderHash: decodedOrder.hash().toLowerCase(),
    chainId: decodedOrder.chainId,
    orderStatus: orderStatus,
    offerer: decodedOrder.info.swapper.toLowerCase(),
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
    })),
    reactor: decodedOrder.info.reactor.toLowerCase(),
    decayStartTime: decodedOrder.info.decayStartTime,
    decayEndTime: decodedOrder.info.deadline,
    deadline: decodedOrder.info.deadline,
    filler: decodedOrder.info?.exclusiveFiller?.toLowerCase(),
    ...(quoteId && { quoteId: quoteId }),
  }

  return order
}

export const formatDutchV2OrderEntity = (
  decodedOrder: CosignedV2DutchOrder,
  signature: string,
  orderStatus: ORDER_STATUS
): UniswapXOrderEntity => {
  const { input, outputs } = decodedOrder.info
  const order: UniswapXOrderEntity = {
    type: OrderType.Dutch_V2,
    encodedOrder: decodedOrder.serialize(),
    signature,
    nonce: decodedOrder.info.nonce.toString(),
    orderHash: decodedOrder.hash().toLowerCase(),
    chainId: decodedOrder.chainId,
    orderStatus: orderStatus,
    offerer: decodedOrder.info.swapper.toLowerCase(),
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
    })),
    reactor: decodedOrder.info.reactor.toLowerCase(),
    decayStartTime: decodedOrder.info.cosignerData.decayStartTime,
    decayEndTime: decodedOrder.info.deadline,
    deadline: decodedOrder.info.deadline,
    filler: decodedOrder.info?.cosignerData?.exclusiveFiller.toLowerCase(),
    cosignerData: mapCosignerData(decodedOrder.info.cosignerData),
    cosignature: decodedOrder.info.cosignature,
  }

  return order
}

function mapCosignerData(sdkCosignerData: CosignerData) {
  return {
    decayStartTime: sdkCosignerData.decayStartTime,
    decayEndTime: sdkCosignerData.decayEndTime,
    exclusiveFiller: sdkCosignerData.exclusiveFiller,
    inputOverride: sdkCosignerData.inputOverride.toString(),
    outputOverrides: sdkCosignerData.outputOverrides.map((o) => o.toString()),
  }
}
