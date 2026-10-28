import GSI_PARTITION_KEYS from './global-secondary-indexes.json'

export enum DYNAMODB_TYPES {
  STRING = 'string',
  NUMBER = 'number',
  MAP = 'map',
  LIST = 'list',
  BOOLEAN = 'boolean',
}

// getStartKey (generic-orders-repository.ts) checks pagination cursors against Object.values(TABLE_KEY)
// for each '-'-separated part of a GSI name. Every key used in an index name, compound ones included,
// must stay here even if nothing references it directly.
export enum TABLE_KEY {
  ORDER_HASH = 'orderHash',
  OFFERER = 'offerer',
  CREATED_AT = 'createdAt',
  ORDER_STATUS = 'orderStatus',
  FILLER = 'filler',
  CHAIN_ID = 'chainId',
  PAIR = 'pair',

  // compound table keys
  CHAIN_ID_FILLER = 'chainId_filler',
  CHAIN_ID_ORDER_STATUS = 'chainId_orderStatus',
  CHAIN_ID_ORDER_STATUS_FILLER = 'chainId_orderStatus_filler',
  FILLER_OFFERER = 'filler_offerer',
  FILLER_OFFERER_ORDER_STATUS = 'filler_offerer_orderStatus',
  FILLER_ORDER_STATUS = 'filler_orderStatus',
  OFFERER_ORDER_STATUS = 'offerer_orderStatus',
}

export type GlobalSecondaryIndex = {
  indexName: string
  partitionKey: TABLE_KEY
  // DynamoDB attribute type of the partition key; the sort key is always the numeric createdAt.
  partitionKeyType: 'S' | 'N'
  sortKey: TABLE_KEY.CREATED_AT
}

const isTableKey = (key: string): key is TABLE_KEY => (Object.values(TABLE_KEY) as string[]).includes(key)

// The GSIs on both the Orders and LimitOrders tables, in the order CDK creates them. The list lives in
// a dependency-free JSON file because jest-dynamodb-config.js (plain node) builds the local tables
// from it too; CDK, the repository index map and the dashboard all read it through here.
export const GLOBAL_SECONDARY_INDEXES: readonly GlobalSecondaryIndex[] = GSI_PARTITION_KEYS.map(
  ({ partitionKey, partitionKeyType }) => {
    if (!isTableKey(partitionKey)) throw new Error(`GSI partition key ${partitionKey} is not a TABLE_KEY`)
    if (partitionKeyType !== 'S' && partitionKeyType !== 'N') {
      throw new Error(`GSI partition key ${partitionKey} has unsupported type ${partitionKeyType}`)
    }
    return {
      indexName: `${partitionKey}-${TABLE_KEY.CREATED_AT}-all`,
      partitionKey,
      partitionKeyType,
      sortKey: TABLE_KEY.CREATED_AT,
    }
  }
)

// The name of the GSI partitioned on `partitionKey`; throws if no such index exists.
export const gsiName = (partitionKey: TABLE_KEY): string => {
  const index = GLOBAL_SECONDARY_INDEXES.find((i) => i.partitionKey === partitionKey)
  if (!index) throw new Error(`No GSI is partitioned on ${partitionKey}`)
  return index.indexName
}
