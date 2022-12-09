import j2s from 'joi-to-swagger'
import { GetNonceQueryParamsJoi, GetNonceResponseJoi } from '../../get-nonce/schema'
import { GetOrdersQueryParamsJoi, GetOrdersResponseJoi, OrderResponseEntryJoi } from '../../get-orders/schema'
import { PostOrderRequestBodyJoi, PostOrderResponseJoi } from '../../post-order/schema'

export type GetJsonResponse = {
  [x: string]: string | string[] | boolean | GetJsonResponse | GetJsonResponse[]
}

const getOrderParamProperties = j2s(GetOrdersQueryParamsJoi).swagger.properties

const OPENAPI_SCHEMA: GetJsonResponse = {
  openapi: '3.0.3',
  info: {
    title: 'Trading API',
    version: '0.0.1',
  },
  tags: [
    {
      name: 'Dutch Auction',
      description: 'Dutch Auction APIs',
    },
  ],
  paths: {
    '/prod/dutch-auction/order': {
      post: {
        tags: ['Dutch Auction'],
        summary: 'Submits a new signed order to the trading API.',
        requestBody: {
          content: {
            'application/json': {
              schema: j2s(PostOrderRequestBodyJoi).swagger,
            },
          },
        },
        responses: {
          '201': {
            description: 'Order submission successful.',
            content: {
              'application/json': {
                schema: j2s(PostOrderResponseJoi).swagger,
              },
            },
          },
          '400': {
            description: 'Invalid Order.',
          },
        },
      },
    },
    '/prod/dutch-auction/orders': {
      get: {
        tags: ['Dutch Auction'],
        summary: 'Retrieve orders filtered by query param(s).',
        description: 'Some fields on the order can be used as query param.',
        parameters: [
          {
            name: 'limit',
            in: 'query',
            description: 'Number of orders to receive.',
            required: false,
            schema: getOrderParamProperties.limit,
          },
          {
            name: 'orderStatus',
            in: 'query',
            description: 'Filter by order status.',
            required: false,
            schema: getOrderParamProperties.orderStatus,
          },
          {
            name: 'orderHash',
            in: 'query',
            description: 'Filter by order hash.',
            required: false,
            schema: getOrderParamProperties.orderHash,
          },
          {
            name: 'offerer',
            in: 'query',
            description: 'Filter by offerer address.',
            required: false,
            schema: getOrderParamProperties.offerer,
          },
          {
            name: 'filler',
            in: 'query',
            description: 'Filter by filler address.',
            required: false,
            schema: getOrderParamProperties.filler,
          },
          {
            name: 'cursor',
            in: 'query',
            description: 'Cursor for paginated queries.',
            required: false,
            schema: getOrderParamProperties.cursor,
          },
        ],
        responses: {
          '200': {
            description: 'Request Successful',
            content: {
              'application/json': {
                schema: j2s(GetOrdersResponseJoi).swagger,
              },
            },
          },
        },
      },
    },
    '/prod/dutch-auction/nonce': {
      get: {
        tags: ['Dutch Auction'],
        summary: 'Get current nonce for dutch auction orders.',
        description: 'Given an address this endpoint will return the next valid nonce to be used in order creation.',
        parameters: [
          {
            name: 'address',
            in: 'query',
            description: 'Ethereum address.',
            required: false,
            schema: j2s(GetNonceQueryParamsJoi).swagger.properties.address,
          },
        ],
        responses: {
          '200': {
            description: 'Request Successful',
            content: {
              'application/json': {
                schema: j2s(GetNonceResponseJoi).swagger,
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      Order: j2s(OrderResponseEntryJoi).swagger,
      Orders: {
        type: 'array',
        items: {
          $ref: '#/components/schemas/Order',
        },
      },
    },
  },
}

export default OPENAPI_SCHEMA
