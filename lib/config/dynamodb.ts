export enum DYNAMODB_TYPES {
  STRING = 'string',
  NUMBER = 'number',
  BINARY = 'binary',
  BOOLEAN = 'boolean',
  MAP = 'map',
  LIST = 'list',
  SET = 'set',
}

export enum TABLE_KEY {
  ORDER_HASH = 'orderHash',
  OFFERER = 'offerer',
  CREATED_AT = 'createdAt',
  NONCE = 'nonce',
  ENCODED_ORDER = 'encodedOrder',
  SIGNATURE = 'signature',
  SELL_TOKEN = 'sellToken',
  ORDER_STATUS = 'orderStatus',
  DEADLINE = 'deadline',
  CREATED_AT_MONTH = 'createdAtMonth',
  FILLER = 'filler',
  TX_HASH = 'txHash',
  CHAIN_ID = 'chainId',
  TYPE = 'type',

  // compound table keys
  CHAIN_ID_FILLER = 'chainId_filler',
  CHAIN_ID_ORDER_STATUS = 'chainId_orderStatus',
  CHAIN_ID_ORDER_STATUS_FILLER = 'chainId_orderStatus_filler',
  FILLER_OFFERER = 'filler_offerer',
  FILLER_OFFERER_ORDER_STATUS = 'filler_offerer_orderStatus',
  FILLER_ORDER_STATUS = 'filler_orderStatus',
  OFFERER_ORDER_STATUS = 'offerer_orderStatus',
}
