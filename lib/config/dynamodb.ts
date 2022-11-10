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
  OFFERER_ORDER_STATUS_SELL_TOKEN = 'offererOrderStatusSellToken',
  OFFERER_ORDER_STATUS = 'offererOrderStatus',
  OFFERER_SELL_TOKEN = 'offererSellToken',
  SELL_TOKEN_ORDER_STATUS = 'sellTokenOrderStatus',
  DEADLINE = 'deadline',
  CREATED_AT_MONTH = 'createdAtMonth',
}
