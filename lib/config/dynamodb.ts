export enum DYNAMODB_TYPES {
  STRING = 'string',
  NUMBER = 'number',
  MAP = 'map',
  LIST = 'list',
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
