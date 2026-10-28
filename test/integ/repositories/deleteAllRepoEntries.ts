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
  await batchDelete(
    documentClient,
    tableName,
    orderHashes.map((orderHash) => ({ orderHash }))
  )
}

/**
 * Deletes the suite's rows: every listable order on `chainIds` and the Nonces rows of
 * `offerers` (keyed `<offerer>-<chainId>`). Nonces is shared by both order tables and by every
 * test file, so only the given offerers' keys are removed, never the whole table.
 */
export async function deleteAllRepoEntries(
  ordersRepository: BaseOrdersRepository<UniswapXOrderEntity>,
  documentClient: DocumentClient,
  tableName: TABLE_NAMES,
  chainIds: number[],
  offerers: string[]
): Promise<void> {
  for (const chainId of chainIds) {
    let orders = await ordersRepository.getOrders(DYNAMO_BATCH_WRITE_MAX, { chainId })
    if (!orders.orders.length) {
      continue
    }
    do {
      await deleteOrdersByHash(
        documentClient,
        tableName,
        orders.orders.map((o) => o.orderHash)
      )
    } while (orders.cursor && (orders = await ordersRepository.getOrders(DYNAMO_BATCH_WRITE_MAX, { chainId })))
  }

  const nonceKeys = (await scanKeys(documentClient, TABLE_NAMES.Nonces, 'offerer')).filter((key) =>
    offerers.some((offerer) => key.startsWith(`${offerer}-`))
  )
  await batchDelete(
    documentClient,
    TABLE_NAMES.Nonces,
    nonceKeys.map((offerer) => ({ offerer }))
  )
}

// Keys of the order and Nonces rows starting with `prefix` that are still in DynamoDB Local.
export async function findLeftoverRows(
  documentClient: DocumentClient,
  tableName: TABLE_NAMES,
  prefix: string
): Promise<string[]> {
  const orderHashes = await scanKeys(documentClient, tableName, 'orderHash')
  const nonceKeys = await scanKeys(documentClient, TABLE_NAMES.Nonces, 'offerer')
  return [...orderHashes, ...nonceKeys].filter((key) => key.startsWith(prefix))
}

async function scanKeys(documentClient: DocumentClient, tableName: TABLE_NAMES, key: string): Promise<string[]> {
  const keys: string[] = []
  let startKey: DocumentClient.Key | undefined
  do {
    const page = await documentClient
      .scan({
        TableName: tableName,
        ProjectionExpression: '#key',
        ExpressionAttributeNames: { '#key': key },
        ...(startKey && { ExclusiveStartKey: startKey }),
      })
      .promise()
    keys.push(...(page.Items ?? []).map((item) => item[key] as string))
    startKey = page.LastEvaluatedKey
  } while (startKey)
  return keys
}

async function batchDelete(
  documentClient: DocumentClient,
  tableName: TABLE_NAMES,
  keys: DocumentClient.Key[]
): Promise<void> {
  for (let i = 0; i < keys.length; i += DYNAMO_BATCH_WRITE_MAX) {
    const chunk = keys.slice(i, i + DYNAMO_BATCH_WRITE_MAX)
    await documentClient
      .batchWrite({ RequestItems: { [tableName]: chunk.map((Key) => ({ DeleteRequest: { Key } })) } })
      .promise()
  }
}
