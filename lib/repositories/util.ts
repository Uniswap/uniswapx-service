import { TABLE_KEY } from '../config/dynamodb'

export enum TABLE_NAMES {
  LimitOrders = 'LimitOrders',
  RelayOrders = 'RelayOrders',
  Orders = 'Orders',
  Nonces = 'Nonces',
  QuoteMetadata = 'QuoteMetadata',
  UnimindParameters = 'UnimindParameters',
}

export const getTableIndices = (tableName: TABLE_NAMES) => {
  switch (tableName) {
    case TABLE_NAMES.LimitOrders:
    case TABLE_NAMES.Orders:
    case TABLE_NAMES.RelayOrders:
    default:
      return {
        [`${TABLE_KEY.OFFERER}-${TABLE_KEY.CREATED_AT}-all`]: {
          partitionKey: TABLE_KEY.OFFERER,
          sortKey: TABLE_KEY.CREATED_AT,
        },
        [`${TABLE_KEY.ORDER_STATUS}-${TABLE_KEY.CREATED_AT}-all`]: {
          partitionKey: TABLE_KEY.ORDER_STATUS,
          sortKey: TABLE_KEY.CREATED_AT,
        },
        [`${TABLE_KEY.FILLER}-${TABLE_KEY.CREATED_AT}-all`]: {
          partitionKey: TABLE_KEY.FILLER,
          sortKey: TABLE_KEY.CREATED_AT,
        },
        [`${TABLE_KEY.CHAIN_ID}-${TABLE_KEY.CREATED_AT}-all`]: {
          partitionKey: TABLE_KEY.CHAIN_ID,
          sortKey: TABLE_KEY.CREATED_AT,
        },
        [`${TABLE_KEY.FILLER}_${TABLE_KEY.ORDER_STATUS}-${TABLE_KEY.CREATED_AT}-all`]: {
          partitionKey: `${TABLE_KEY.FILLER}_${TABLE_KEY.ORDER_STATUS}`,
          sortKey: TABLE_KEY.CREATED_AT,
        },
        [`${TABLE_KEY.FILLER}_${TABLE_KEY.OFFERER}-${TABLE_KEY.CREATED_AT}-all`]: {
          partitionKey: `${TABLE_KEY.FILLER}_${TABLE_KEY.OFFERER}`,
          sortKey: TABLE_KEY.CREATED_AT,
        },
        [`${TABLE_KEY.FILLER}_${TABLE_KEY.OFFERER}_${TABLE_KEY.ORDER_STATUS}-${TABLE_KEY.CREATED_AT}-all`]: {
          partitionKey: `${TABLE_KEY.FILLER}_${TABLE_KEY.OFFERER}_${TABLE_KEY.ORDER_STATUS}`,
          sortKey: TABLE_KEY.CREATED_AT,
        },
        [`${TABLE_KEY.OFFERER}_${TABLE_KEY.ORDER_STATUS}-${TABLE_KEY.CREATED_AT}-all`]: {
          partitionKey: `${TABLE_KEY.OFFERER}_${TABLE_KEY.ORDER_STATUS}`,
          sortKey: TABLE_KEY.CREATED_AT,
        },
        [`${TABLE_KEY.CHAIN_ID}_${TABLE_KEY.FILLER}-${TABLE_KEY.CREATED_AT}-all`]: {
          partitionKey: `${TABLE_KEY.CHAIN_ID}_${TABLE_KEY.FILLER}`,
          sortKey: TABLE_KEY.CREATED_AT,
        },
        [`${TABLE_KEY.CHAIN_ID}_${TABLE_KEY.ORDER_STATUS}-${TABLE_KEY.CREATED_AT}-all`]: {
          partitionKey: `${TABLE_KEY.CHAIN_ID}_${TABLE_KEY.ORDER_STATUS}`,
          sortKey: TABLE_KEY.CREATED_AT,
        },
        [`${TABLE_KEY.CHAIN_ID}_${TABLE_KEY.ORDER_STATUS}_${TABLE_KEY.FILLER}-${TABLE_KEY.CREATED_AT}-all`]: {
          partitionKey: `${TABLE_KEY.CHAIN_ID}_${TABLE_KEY.ORDER_STATUS}_${TABLE_KEY.FILLER}`,
          sortKey: TABLE_KEY.CREATED_AT,
        },
        [`${TABLE_KEY.PAIR}-${TABLE_KEY.CREATED_AT}-all`]: {
          partitionKey: TABLE_KEY.PAIR,
          sortKey: TABLE_KEY.CREATED_AT,
        },
        offererNonceIndex: { partitionKey: TABLE_KEY.OFFERER, sortKey: TABLE_KEY.NONCE },
      }
  }
}
