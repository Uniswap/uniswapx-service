import j2s from 'joi-to-swagger'
import { GetOrdersQueryParamsJoi, GetOrdersResponseJoi, OrderResponseEntryJoi } from '../../get-orders/schema'
import { PostOrderRequestBodyJoi, PostOrderResponseJoi } from '../../post-order/schema'

const getOrderParamProperties = j2s(GetOrdersQueryParamsJoi).swagger.properties

const OPENAPI_SCHEMA: { [key: string]: any } = {
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
        description: 'Each field on the order can be used as query param.',
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
            name: 'sellToken',
            in: 'query',
            description: 'Filter by sell token address.',
            required: false,
            schema: getOrderParamProperties.sellToken,
          },
          {
            name: 'cursor',
            in: 'query',
            description: 'Cursor set to the next page of results for paginated queries.',
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
