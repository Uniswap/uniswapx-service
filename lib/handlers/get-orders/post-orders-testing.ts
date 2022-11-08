import { DynamoDB } from 'aws-sdk'
import { ORDER_STATUS } from '../../entities'

const getItem = (
  orderHash: string,
  orderStatus: string,
  encodedOrder: string,
  signature: string,
  offerer: string,
  sellToken: string,
  deadline: number
) => {
  return {
    orderHash,
    orderStatus,
    encodedOrder,
    signature,
    offerer,
    sellToken: sellToken,
    deadline,
    offererOrderStatus: `${offerer}-${orderStatus}`,
    offererSellToken: `${offerer}-${sellToken}`,
    sellTokenOrderStatus: `${sellToken}-${orderStatus}`,
    offererOrderStatusSellToken: `${offerer}-${orderStatus}-${sellToken}`,
    createdAt: new Date().getTime(),
  }
}

export const setupMockItemsInDb = async () => {
  for (let i = 0; i <= 1000; i += 10) {
    const orders = []
    for (let y = i; y <= i + 10; y++) {
      // const rand = Math.floor(Math.random() * 1000000)
      orders.push({
        PutRequest: {
          Item: getItem(
            `0xdeadbeef${y}`,
            ORDER_STATUS.OPEN,
            `0xencodedorder${i}`,
            `0x2fc6871c340516630f7fb42fbbf0a82e5aaf195a8adf72b23978d8a8a9b0596929381719180a40983bd12783646aa466341dd7d0d6c34ae6d706eaa44c435dce1${
              i % 10
            }`,
            `0x1325ad66ad5fa02621d3ad52c9323c6c2bff268${y % 10}`.toLowerCase(),
            `0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc${y + (1 % 10)}`.toLowerCase(),
            i
          ),
        },
      })
    }

    const dbParams = {
      RequestItems: {
        Orders: orders,
      },
    }
    const dynamoClient = new DynamoDB.DocumentClient()
    await dynamoClient.batchWrite(dbParams).promise()
  }
}
