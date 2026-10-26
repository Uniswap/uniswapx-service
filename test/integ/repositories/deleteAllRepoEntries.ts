import { DocumentClient } from 'aws-sdk/clients/dynamodb'
import { UniswapXOrderEntity } from '../../../lib/entities'
import { BaseOrdersRepository } from '../../../lib/repositories/base'
import { TABLE_NAMES } from '../../../lib/repositories/util'
import { DYNAMO_BATCH_WRITE_MAX } from '../../../lib/util/constants'

// Test-only cleanup: production code never deletes order rows.
export async function deleteOrdersByHash(
  documentClient: DocumentClient,
  tableName: TABLE_NAMES,
  orderHashes: string[]
): Promise<void> {
  for (let i = 0; i < orderHashes.length; i += DYNAMO_BATCH_WRITE_MAX) {
    const chunk = orderHashes.slice(i, i + DYNAMO_BATCH_WRITE_MAX)
    await documentClient
      .batchWrite({
        RequestItems: { [tableName]: chunk.map((orderHash) => ({ DeleteRequest: { Key: { orderHash } } })) },
      })
      .promise()
  }
}

export async function deleteAllRepoEntries(
  ordersRepository: BaseOrdersRepository<UniswapXOrderEntity>,
  documentClient: DocumentClient,
  tableName: TABLE_NAMES
) {
  for (const chainId of [1, 137]) {
    let orders = await ordersRepository.getOrders(DYNAMO_BATCH_WRITE_MAX, { chainId })
    if (!orders.orders.length) {
      return
    }
    do {
      await deleteOrdersByHash(
        documentClient,
        tableName,
        orders.orders.map((o) => o.orderHash)
      )
    } while (orders.cursor && (orders = await ordersRepository.getOrders(DYNAMO_BATCH_WRITE_MAX, { chainId })))
  }
}
