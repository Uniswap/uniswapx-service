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
    offerer_orderStatus: `${offerer}_${orderStatus}`,
    offerer_sellToken: `${offerer}_${sellToken}`,
    sellToken_orderStatus: `${sellToken}_${orderStatus}`,
    offerer_orderStatus_sellToken: `${offerer}_${orderStatus}_${sellToken}`,
    createdAt: new Date().getTime(),
    createdAtMonth: new Date().getMonth(),
  }
}
function pad(n: string, width: number, z: string) {
  z = z || '0'
  n = n + ''
  return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n
}
export const setupMockItemsInDb = async () => {
  for (let i = 0; i <= 100; i += 10) {
    const orders = []
    for (let y = i; y <= i + 10; y++) {
      const rand = Math.floor(Math.random() * 1000000)
      orders.push({
        PutRequest: {
          Item: getItem(
            `0x${pad(rand.toString(), 64, '0')}`,
            ORDER_STATUS.OPEN,
            `0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000e9781560d93c27aa4c4f3543631d191d10608d20000000000000000000000000496d57839975e5c0bd36d39ffa27336b078b1b16000000000000000000000000000000000000000000000000000000000000002800000000000000000000000000000000000000000000000000000000633f664000000000000000000000000000000000000000000000000000000000633f6604000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2000000000000000000000000000000000000000000000000016345785d8a0000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000010000000000000000000000006b175474e89094c44da98b954eedeac495271d0f00000000000000000000000000000000000000000000001b1ae4d6e2ef500000000000000000000000000000000000000000000000000015af1d78b58c400000000000000000000000000000496d57839975e5c0bd36d39ffa27336b078b1b16${i}`,
            `0x2fc6871c340516630f7fb42fbbf0a82e5aaf195a8adf72b23978d8a8a9b0596929381719180a40983bd12783646aa466341dd7d0d6c34ae6d706eaa44c435dce1${
              i % 10
            }`,
            `0x1325ad66ad5fa02621d3ad52c9323c6c2bff268${y % 10}`,
            i % 2 == 0 ? `0x1f9840a85d5af5bf1d1762f925bdaddc4201f984` : `0x6b3595068778dd592e39a122f4f5a5cf09c90fe2`,
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
