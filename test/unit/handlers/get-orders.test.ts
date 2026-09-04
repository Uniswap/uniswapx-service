import { Logger } from '@aws-lambda-powertools/logger'
import { OrderType } from '@uniswap/uniswapx-sdk'
import { mock } from 'jest-mock-extended'
import { ORDER_STATUS } from '../../../lib/entities'
import { GET_LIMIT_ORDERS_HANDLER_OPTIONS, GetOrdersHandler } from '../../../lib/handlers/get-orders/handler'
import { parseGetQueryParams } from '../../../lib/handlers/shared/get'
import { GetOrdersQueryParamsJoi } from '../../../lib/handlers/get-orders/schema'
import { OrderDispatcher } from '../../../lib/services/OrderDispatcher'
import { SUPPORTED_CHAINS } from '../../../lib/util/chain'
import { HeaderExpectation } from '../../HeaderExpectation'
import { REQUEST_ID } from '../fixtures'
import Joi from 'joi'
import { GetDutchV3OrderResponse, GetDutchV3OrderResponseEntryJoi } from '../../../lib/handlers/get-orders/schema/GetDutchV3OrderResponse'
import { GetOrdersResponseJoi } from '../../../lib/handlers/get-orders/schema/GetOrdersResponse'

describe('Testing get orders handler.', () => {
  const MOCK_ORDER = {
    signature:
      '0x1c33da80f46194b0db3398de4243d695dfa5049c4cc341e80f5b630804a47f2f52b9d16cb65b2a2d8ed073da4b295c7cb3ccc13a49a16a07ad80b796c31b283414',
    orderStatus: ORDER_STATUS.OPEN,
    orderHash: '0xa2444ef606a0d99809e1878f7b819541618f2b7990bb9a7275996b362680cae4',
    swapper: '0x11E4857Bb9993a50c685A79AFad4E6F65D518DDa',
    createdAt: 1667276283251,
    encodedOrder:
      '0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000012000000000000000000000000000000000000000000000000000000000660dd1d600000000000000000000000000000000000000000000000000000000660dd1e00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000002000000000000000000000000006000da47483062a0d734ba3dc7576ce6a0b645c400000000000000000000000011e4857bb9993a50c685a79afad4e6f65d518dda000000000000000000000000000000000000000000000000000000000000006400000000000000000000000000000000000000000000000000000000660dd1e0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000c000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000029a2241af62c00000000000000000000000000000000000000000000000000001bc16d674ec8000000000000000000000000000011e4857bb9993a50c685a79afad4e6f65d518dda',
    type: OrderType.Dutch,
    chainId: 1,
    input: {
      token: '0x0000000000000000000000000000000000000000',
      startAmount: '1000000000000000000',
      endAmount: '1000000000000000000',
    },
    outputs: [
      {
        token: '0x0000000000000000000000000000000000000001',
        startAmount: '3000000000000000000',
        endAmount: '2000000000000000000',
        recipient: '0x11E4857Bb9993a50c685A79AFad4E6F65D518DDa',
      },
    ],
  }

  const MOCK_V3_ORDER = {
    signature:
      '0x1c33da80f46194b0db3398de4243d695dfa5049c4cc341e80f5b630804a47f2f52b9d16cb65b2a2d8ed073da4b295c7cb3ccc13a49a16a07ad80b796c31b283414',
    orderStatus: ORDER_STATUS.OPEN,
    orderHash: '0xbfa41c91a61907aa4023a9f98da5ea1b18ea109bd092a62fc896299874019e19',
    swapper: '0x11E4857Bb9993a50c685A79AFad4E6F65D518DDa',
    encodedOrder:
      '0x00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000de0b6b3a76400000000000000000000000000000000000000000000000000000de0b6b3a7640000000000000000000000000000000000000000000000000000000000000000022000000000000000000000000000000000000000000000000000000000000002c000000000000000000000000000000000000000000000000000000000000003c00000000000000000000000003867393cc6ea7b0414c2c3e1d9fe7cea987fd06600000000000000000000000011e4857bb9993a50c685a79afad4e6f65d518dda000000000000000000000000000000000000000000000000000000000000006400000000000000000000000000000000000000000000000000000000660dd05e000000000000000000000000222222222222222222222222222222222222222200000000000000000000000000000000000000000000000000000000000000c00000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000660dd05e0000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000029a2241af62c00000000000000000000000000000000000000000000000000001bc16d674ec8000000000000000000000000000011e4857bb9993a50c685a79afad4e6f65d518dda00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000de0b6b3a764000000000000000000000000000000000000000000000000000000000000000000c0000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000029a2241af62c000000000000000000000000000000000000000000000000000000000000000000411c33da80f46194b0db3398de4243d695dfa5049c4cc341e80f5b630804a47f2f52b9d16cb65b2a2d8ed073da4b295c7cb3ccc13a49a16a07ad80b796c31b28341400000000000000000000000000000000000000000000000000000000000000',
    type: OrderType.Dutch_V3,
    chainId: 42161,
    startingBaseFee: '1000000000000000000',
    input: {
      token: '0x0000000000000000000000000000000000000000',
      startAmount: '1000000000000000000',
      adjustmentPerGweiBaseFee: '5000',
      curve: {
        relativeBlocks: [1, 2, 3],
        relativeAmounts: ['4', '5', '6'],
      },
      maxAmount: '1000000000000000000',
    },
    cosignerData: {
      decayStartBlock: 1,
      exclusiveFiller: '0x0000000000000000000000000000000000000000',
      inputOverride: '1000000000000000000',
      outputOverrides: ['3000000000000000000'],
    },
    cosignature:
      '0x1c33da80f46194b0db3398de4243d695dfa5049c4cc341e80f5b630804a47f2f52b9d16cb65b2a2d8ed073da4b295c7cb3ccc13a49a16a07ad80b796c31b283414',
    outputs: [
      {
        token: '0x0000000000000000000000000000000000000001',
        startAmount: '3000000000000000000',
        adjustmentPerGweiBaseFee: '5000',
        curve: {
          relativeBlocks: [1, 2, 3],
          relativeAmounts: ['4', '5', '6'],
        },
        minAmount: '2000000000000000000',
        recipient: '0x11E4857Bb9993a50c685A79AFad4E6F65D518DDa',
      },
    ],
  }

  const MOCK_PRIORITY_ORDER = {
    signature:
      '0x1c33da80f46194b0db3398de4243d695dfa5049c4cc341e80f5b630804a47f2f52b9d16cb65b2a2d8ed073da4b295c7cb3ccc13a49a16a07ad80b796c31b283414',
    orderStatus: ORDER_STATUS.OPEN,
    orderHash: '0xbfa41c91a61907aa4023a9f98da5ea1b18ea109bd002a62fc896299874019e19',
    swapper: '0x11E4857Bb9993a50c685A79AFad4E6F65D518DDa',
    encodedOrder:
      '0x00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000de0b6b3a76400000000000000000000000000000000000000000000000000000de0b6b3a7640000000000000000000000000000000000000000000000000000000000000000022000000000000000000000000000000000000000000000000000000000000002c000000000000000000000000000000000000000000000000000000000000003c00000000000000000000000003867393cc6ea7b0414c2c3e1d9fe7cea987fd06600000000000000000000000011e4857bb9993a50c685a79afad4e6f65d518dda000000000000000000000000000000000000000000000000000000000000006400000000000000000000000000000000000000000000000000000000660dd05e000000000000000000000000222222222222222222222222222222222222222200000000000000000000000000000000000000000000000000000000000000c00000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000660dd05e0000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000029a2241af62c00000000000000000000000000000000000000000000000000001bc16d674ec8000000000000000000000000000011e4857bb9993a50c685a79afad4e6f65d518dda00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000de0b6b3a764000000000000000000000000000000000000000000000000000000000000000000c0000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000029a2241af62c000000000000000000000000000000000000000000000000000000000000000000411c33da80f46194b0db3398de4243d695dfa5049c4cc341e80f5b630804a47f2f52b9d16cb65b2a2d8ed073da4b295c7cb3ccc13a49a16a07ad80b796c31b28341400000000000000000000000000000000000000000000000000000000000000',
    type: OrderType.Priority,
    auctionStartBlock: 100,
    baselinePriorityFeeWei: '0',
    chainId: 1,
    input: {
      token: '0x0000000000000000000000000000000000000000',
      amount: '1000000000000000000',
      mpsPerPriorityFeeWei: '0',
    },
    cosignerData: {
      auctionTargetBlock: 95,
    },
    cosignature:
      '0x1c33da80f46194b0db3398de4243d695dfa5049c4cc341e80f5b630804a47f2f52b9d16cb65b2a2d8ed073da4b295c7cb3ccc13a49a16a07ad80b796c31b283414',
    outputs: [
      {
        token: '0x0000000000000000000000000000000000000001',
        amount: '1000000000000000000',
        mpsPerPriorityFeeWei: '1',
        recipient: '0x11E4857Bb9993a50c685A79AFad4E6F65D518DDa',
      },
    ],
  }

  let getOrdersMock: any, queryFiltersMock: any, requestInjectedMock: any, injectorPromiseMock: any

  beforeEach(async () => {
    // Creating mocks for all the handler dependencies.
    getOrdersMock = jest.fn()
    queryFiltersMock = {
      offerer: MOCK_ORDER.swapper,
      filler: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
      orderStatus: ORDER_STATUS.OPEN,
    }
    requestInjectedMock = {
      limit: 10,
      queryFilters: queryFiltersMock,
      log: mock<Logger>(),
    }
    injectorPromiseMock = {
      getContainerInjected: () => {
        return {
          dbInterface: {
            getOrders: getOrdersMock,
          },
        }
      },
      getRequestInjected: () => requestInjectedMock,
    }
    getOrdersMock.mockReturnValue({ orders: [MOCK_ORDER] })
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('Testing valid request and response.', async () => {
    const event = {
      queryStringParameters: queryFiltersMock,
      body: null,
    }

    const getOrdersHandler = (injectedMock = injectorPromiseMock) =>
      new GetOrdersHandler('get-orders', injectedMock, mock<OrderDispatcher>())

    const getOrdersResponse = await getOrdersHandler().handler(event as any, {} as any)
    expect(getOrdersMock).toBeCalledWith(requestInjectedMock.limit, queryFiltersMock, undefined)
    expect(getOrdersResponse).toMatchObject({
      body: JSON.stringify({ orders: [MOCK_ORDER] }),
      statusCode: 200,
    })
    expect(getOrdersResponse.headers).not.toBeUndefined()
    const headerExpectation = new HeaderExpectation(getOrdersResponse.headers)
    headerExpectation.toAllowAllOrigin().toAllowCredentials().toReturnJsonContentType()
  })

  it('Testing valid request and response, Priority order', async () => {
    const getOrdersHandler = (injectedMock = injectorPromiseMock) =>
      new GetOrdersHandler('get-orders', injectedMock, mock<OrderDispatcher>())
    getOrdersMock.mockReturnValue({
      orders: [MOCK_PRIORITY_ORDER],
    })

    const getOrdersResponse = await getOrdersHandler().handler({} as any, {} as any)

    expect(getOrdersMock).toBeCalledWith(requestInjectedMock.limit, queryFiltersMock, undefined)
    expect(getOrdersResponse).toMatchObject({
      body: JSON.stringify({
        orders: [MOCK_PRIORITY_ORDER],
      }),
      statusCode: 200,
    })
    expect(getOrdersResponse.headers).not.toBeUndefined()
    const headerExpectation = new HeaderExpectation(getOrdersResponse.headers)
    headerExpectation.toAllowAllOrigin().toAllowCredentials().toReturnJsonContentType()
  })

  it('Testing valid request and response, DutchV3 order', async () => {
    const getOrdersHandler = (injectedMock = injectorPromiseMock) =>
      new GetOrdersHandler('get-orders', injectedMock, mock<OrderDispatcher>())
    getOrdersMock.mockReturnValue({
      orders: [MOCK_V3_ORDER],
    })

    const getOrdersResponse = await getOrdersHandler().handler({} as any, {} as any)

    expect(getOrdersMock).toBeCalledWith(requestInjectedMock.limit, queryFiltersMock, undefined)
    expect(getOrdersResponse).toMatchObject({
      body: JSON.stringify({
        orders: [MOCK_V3_ORDER],
      }),
      statusCode: 200,
    })
    expect(getOrdersResponse.headers).not.toBeUndefined()
    const headerExpectation = new HeaderExpectation(getOrdersResponse.headers)
    headerExpectation.toAllowAllOrigin().toAllowCredentials().toReturnJsonContentType()
  })

  it('Testing valid request and response with chainId.', async () => {
    const event = {
      queryStringParameters: queryFiltersMock,
      body: null,
    }

    const getOrdersHandler = (injectedMock = injectorPromiseMock) =>
      new GetOrdersHandler('get-orders', injectedMock, mock<OrderDispatcher>())

    const tempQueryFilters = {
      chainId: 1,
      filler: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
      orderStatus: ORDER_STATUS.OPEN,
    }
    const getOrdersResponse = await getOrdersHandler({
      ...injectorPromiseMock,
      getRequestInjected: () => ({
        ...requestInjectedMock,
        queryFilters: tempQueryFilters,
      }),
    }).handler({ ...event, queryStringParameters: tempQueryFilters } as any, {} as any)
    expect(getOrdersMock).toBeCalledWith(requestInjectedMock.limit, tempQueryFilters, undefined)
    expect(getOrdersResponse).toMatchObject({
      body: JSON.stringify({ orders: [MOCK_ORDER] }),
      statusCode: 200,
    })
    expect(getOrdersResponse.headers).not.toBeUndefined()
    const headerExpectation = new HeaderExpectation(getOrdersResponse.headers)
    headerExpectation.toAllowAllOrigin().toAllowCredentials().toReturnJsonContentType()
  })

  describe('Testing invalid request validation.', () => {
    it.each([
      [{ orderHash: '0xbad_hash' }, 'orderHash\\" with value \\"0xbad_hash\\" fails to match the required pattern'],
      [
        { orderHashes: '0xbad_hash1,0xbad_hash2' },
        'Invalid input. Expected comma-separated order hashes, with a maximum of 50, each matching the pattern \\"^0x[0-9a-zA-Z]64$\\".","errorCode":"VALIDATION_ERROR"',
      ],
      [{ swapper: '0xbad_address' }, 'VALIDATION ERROR: Invalid address'],
      [{ orderStatus: 'bad_status' }, 'contains an invalid value'],
      [{ orderStatus: ',' }, 'contains an invalid value'],
      [{ orderStatus: 'open,' }, 'contains an invalid value'],
      [{ orderStatus: ',open' }, 'contains an invalid value'],
      [{ orderStatus: 'open,bad_status' }, 'contains an invalid value'],
      [{ orderStatus: 'open,open' }, 'must not repeat a status'],
      [{ orderStatus: 'filled,expired,filled' }, 'must not repeat a status'],
      [{ limit: 'bad_limit' }, 'must be a number'],
      [{ filler: '0xcorn' }, 'VALIDATION ERROR: Invalid address'],
      [
        { chainId: 420 },
        `{"detail":"\\"chainId\\" must be one of [${SUPPORTED_CHAINS.join(', ')}]","errorCode":"VALIDATION_ERROR"}`,
      ],
      [
        { chainId: 1, swapper: '0x11E4857Bb9993a50c685A79AFad4E6F65D518DDa' },
        '{"detail":"Querying with both swapper and chainId is not currently supported.","errorCode":"VALIDATION_ERROR"}',
      ],
    ])('Throws 400 with invalid query param %p', async (invalidQueryParam, bodyMsg) => {
      const event = {
        queryStringParameters: queryFiltersMock,
        body: null,
      }

      const getOrdersHandler = (injectedMock = injectorPromiseMock) =>
        new GetOrdersHandler('get-orders', injectedMock, mock<OrderDispatcher>())

      const invalidEvent = {
        ...event,
        queryStringParameters: invalidQueryParam,
      }
      const getOrdersResponse = await getOrdersHandler().handler(invalidEvent as any, {} as any)
      expect(getOrdersMock).not.toHaveBeenCalled()
      expect(getOrdersResponse.statusCode).toEqual(400)
      expect(getOrdersResponse.body).toEqual(expect.stringContaining(bodyMsg))
      expect(getOrdersResponse.body).toEqual(expect.stringContaining('VALIDATION_ERROR'))
    })
  })

  describe('Testing invalid response validation.', () => {
    it.each([
      [{ orderHash: '0xbad_hash' }],
      [{ swapper: '0xbad_address' }],
      [{ orderStatus: 'bad_status' }],
      [{ signature: '0xbad_sig' }],
      [{ encodedOrder: '0xencoded$$$order' }],
      [{ createdAt: 'bad_created_at' }],
      [{ txHash: '0xbadTxHash' }],
      [{ type: 'BadOrderType' }],
      [{ input: { token: 'bad token' } }],
      [{ outputs: [{ startAmount: 'bad start' }] }],
      [{ chainId: 'nope' }],
    ])('Throws 500 with invalid field %p in the response', async (invalidResponseField) => {
      const event = {
        queryStringParameters: queryFiltersMock,
        body: null,
      }

      const getOrdersHandler = (injectedMock = injectorPromiseMock) =>
        new GetOrdersHandler('get-orders', injectedMock, mock<OrderDispatcher>())

      getOrdersMock.mockReturnValue({ orders: [{ ...MOCK_ORDER, ...invalidResponseField }] })
      const getOrdersResponse = await getOrdersHandler().handler(event as any, {} as any)
      expect(getOrdersMock).toBeCalledWith(requestInjectedMock.limit, requestInjectedMock.queryFilters, undefined)
      expect(getOrdersResponse.statusCode).toEqual(500)
      expect(getOrdersResponse.body).toEqual(expect.stringContaining('INTERNAL_ERROR'))
    })

    it('Throws 500 when db interface errors out.', async () => {
      const event = {
        queryStringParameters: queryFiltersMock,
        body: null,
      }

      const getOrdersHandler = (injectedMock = injectorPromiseMock) =>
        new GetOrdersHandler('get-orders', injectedMock, mock<OrderDispatcher>())

      const error = new Error('Oh no! This is an error.')
      getOrdersMock.mockImplementation(() => {
        throw error
      })
      const getOrdersResponse = await getOrdersHandler().handler(event as any, {} as any)
      expect(getOrdersMock).toBeCalledWith(requestInjectedMock.limit, requestInjectedMock.queryFilters, undefined)
      expect(getOrdersResponse).toMatchObject({
        body: JSON.stringify({ detail: error.message, errorCode: 'INTERNAL_ERROR' }),
        statusCode: 500,
      })

      expect(getOrdersResponse.headers).not.toBeUndefined()
      const headerExpectation = new HeaderExpectation(getOrdersResponse.headers)
      headerExpectation.toAllowAllOrigin().toAllowCredentials().toReturnJsonContentType()
    })
  })

  describe('Testing valid but deprecated response fields', () => {
    it.each([[{ chainId: 12341234 }]])(
      `Returns 200 with deprecated field %p in the response`,
      async (deprecatedField) => {
        const event = {
          queryStringParameters: queryFiltersMock,
          body: null,
        }

        const getOrdersHandler = (injectedMock = injectorPromiseMock) =>
          new GetOrdersHandler('get-orders', injectedMock, mock<OrderDispatcher>())
        getOrdersMock.mockReturnValue({ orders: [{ ...MOCK_ORDER, ...deprecatedField }] })
        const getOrdersResponse = await getOrdersHandler().handler(event as any, {} as any)
        expect(getOrdersMock).toBeCalledWith(requestInjectedMock.limit, requestInjectedMock.queryFilters, undefined)
        expect(getOrdersResponse.statusCode).toEqual(200)
      }
    )
  })

  describe('quoteId and requestId', () => {
    it(`Returns 200 with quoteId and requestId`, async () => {
      const event = {
        queryStringParameters: queryFiltersMock,
        body: null,
      }

      const getOrdersHandler = (injectedMock = injectorPromiseMock) =>
        new GetOrdersHandler('get-orders', injectedMock, mock<OrderDispatcher>())

      getOrdersMock.mockReturnValue({
        orders: [{ ...MOCK_ORDER, quoteId: '4385e89a-0553-46fa-9b7e-464c1fa7822f', requestId: REQUEST_ID }],
      })
      const getOrdersResponse = await getOrdersHandler().handler(event as any, {} as any)
      expect(getOrdersMock).toBeCalledWith(requestInjectedMock.limit, requestInjectedMock.queryFilters, undefined)
      expect(getOrdersResponse.statusCode).toEqual(200)

      expect(JSON.parse(getOrdersResponse.body).orders[0].quoteId).toEqual('4385e89a-0553-46fa-9b7e-464c1fa7822f')
      expect(JSON.parse(getOrdersResponse.body).orders[0].requestId).toEqual(REQUEST_ID)
    })

    it(`Returns 200 when quoteId is undefined`, async () => {
      const event = {
        queryStringParameters: queryFiltersMock,
        body: null,
      }

      const getOrdersHandler = (injectedMock = injectorPromiseMock) =>
        new GetOrdersHandler('get-orders', injectedMock, mock<OrderDispatcher>())

      getOrdersMock.mockReturnValue({ orders: [{ ...MOCK_ORDER, quoteId: undefined }] })
      const getOrdersResponse = await getOrdersHandler().handler(event as any, {} as any)
      expect(getOrdersMock).toBeCalledWith(requestInjectedMock.limit, requestInjectedMock.queryFilters, undefined)
      expect(getOrdersResponse.statusCode).toEqual(200)
      expect(JSON.parse(getOrdersResponse.body).orders[0].quoteId).not.toBeDefined()
    })
  })

  describe('response validation', () => {
    const FILL_FIELDS = {
      orderStatus: ORDER_STATUS.FILLED,
      txHash: '0x8f0d2b6b5a4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1b0c9d8e',
      fillBlock: 12_345_678,
      fillTimestamp: 1_700_000_000,
    }

    it('returns fillBlock and fillTimestamp for a filled order', async () => {
      const event = {
        queryStringParameters: queryFiltersMock,
        body: null,
      }
      const getOrdersHandler = (injectedMock = injectorPromiseMock) =>
        new GetOrdersHandler('get-orders', injectedMock, mock<OrderDispatcher>())

      getOrdersMock.mockReturnValue({ orders: [{ ...MOCK_ORDER, ...FILL_FIELDS }] })
      const getOrdersResponse = await getOrdersHandler().handler(event as any, {} as any)

      expect(getOrdersResponse.statusCode).toEqual(200)
      expect(JSON.parse(getOrdersResponse.body).orders[0]).toEqual(expect.objectContaining(FILL_FIELDS))
    })

    it.each([
      ['Dutch', { ...MOCK_ORDER, ...FILL_FIELDS }],
      ['Dutch_V3', { ...MOCK_V3_ORDER, ...FILL_FIELDS }],
    ])('keeps fillBlock and fillTimestamp on a %s entry through stripUnknown', (_type, order) => {
      const result = GetOrdersResponseJoi.validate({ orders: [order] }, { allowUnknown: true, stripUnknown: true })

      expect(result.error).toBeUndefined()
      expect(result.value.orders[0].fillBlock).toEqual(FILL_FIELDS.fillBlock)
      expect(result.value.orders[0].fillTimestamp).toEqual(FILL_FIELDS.fillTimestamp)
    })

    it('DutchV3 order passes response validation', async () => {

      const v3order: GetDutchV3OrderResponse = JSON.parse('{"outputs":[{"recipient":"0x250a94c03b9b57c93cc5549760d59d6eacfb136d","minAmount":"6097025","startAmount":"6119175","curve":{"relativeAmounts":["22150"],"relativeBlocks":[8]},"token":"0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8","adjustmentPerGweiBaseFee":"0"}],"filler_offerer_orderStatus":"0x0000000000000000000000000000000000000000_0x250a94c03b9b57c93cc5549760d59d6eacfb136d_open","reactor":"0xb274d5f4b833b61b340b654d600a864fb604a87c","offerer_orderStatus":"0x250a94c03b9b57c93cc5549760d59d6eacfb136d_open","encodedOrder":"0x000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000e00000000000000000000000004449cd34d1eb1fedcf02a1be3834ffde8e6a6180000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001c000000000000000000000000000000000000000000000000000000000000002e000000000000000000000000000000000000000000000000000000000000004600000000000000000000000000000000000000000000000000000000000000540000000000000000000000000b274d5f4b833b61b340b654d600a864fb604a87c000000000000000000000000250a94c03b9b57c93cc5549760d59d6eacfb136df038f18e74bf2b1cbb5d94d8029d443414976bd38efec768706eca33b004fa0000000000000000000000000000000000000000000000000000000000674ec602000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000c0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000082af49447d8a07e3bd95bd0d56f35241523fbab100000000000000000000000000000000000000000000000000060a24181e400000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000060a24181e40000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000020000000000000000000000000ff970a61a04b1ca14834a43f5de4533ebddb5cc800000000000000000000000000000000000000000000000000000000005d5f0700000000000000000000000000000000000000000000000000000000000000c0000000000000000000000000250a94c03b9b57c93cc5549760d59d6eacfb136d00000000000000000000000000000000000000000000000000000000005d0881000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000056860000000000000000000000000000000000000000000000000000000010bd7baa00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000041d1c99bcbee1bed23ee847cfe3d501f034f23b8ba67c249dc07a2ca7c376dd9c04f31eabe9dd15d9b3464cd72196975fbb71a1455233afe0d1050e312c58976fc1b00000000000000000000000000000000000000000000000000000000000000","requestId":"6fe3b04d-658a-4529-af66-76bcdd7d5265","signature":"0xaebea601f90e77d5ae72f5c28a14ccc71e88ac61e2af0fc8f45278c1367696fb080ddebb4b66b05559d5fe34533f756844b279fecc18c562233d9b0a2fbb870a1c","deadline":1733215746,"cosignature":"0xd1c99bcbee1bed23ee847cfe3d501f034f23b8ba67c249dc07a2ca7c376dd9c04f31eabe9dd15d9b3464cd72196975fbb71a1455233afe0d1050e312c58976fc1b","cosignerData":{"exclusiveFiller":"0x0000000000000000000000000000000000000000","inputOverride":"0","outputOverrides":["0"],"decayStartBlock":280853418},"modified":"2024-12-03T08:44:07.702Z","input":{"startAmount":"1700000000000000","maxAmount":"1700000000000000","curve":{"relativeAmounts":["0"],"relativeBlocks":[8]},"token":"0x82aF49447D8a07e3bd95BD0d56f35241523fBab1","adjustmentPerGweiBaseFee":"0"},"filler":"0x0000000000000000000000000000000000000000","orderStatus":"open","chainId_orderStatus_filler":"42161_open_0x0000000000000000000000000000000000000000","createdAt":1733215447,"chainId_filler":"42161_0x0000000000000000000000000000000000000000","entity":"Order","quoteId":"6fe3b04d-658a-4529-af66-76bcdd7d5265","filler_offerer":"0x0000000000000000000000000000000000000000_0x250a94c03b9b57c93cc5549760d59d6eacfb136d","filler_orderStatus":"0x0000000000000000000000000000000000000000_open","created":"2024-12-03T08:44:07.702Z","chainId":42161,"orderHash":"0xa694497e3644c2ce58a22b4b3fcd6004e3faf8057dc409a70da08aea85a92b4b","chainId_orderStatus":"42161_open","nonce":"108655694257088393948171748675121105290610995892134912696918847811839007717888","startingBaseFee":"0","type":"Dutch_V3","swapper":"0x250a94c03b9b57c93cc5549760d59d6eacfb136d"}');
      const responseSchema = Joi.alternatives(GetDutchV3OrderResponseEntryJoi);
      const result = responseSchema.validate(v3order, {
        allowUnknown: true,
        stripUnknown: true, // Ensure no unexpected fields returned to users.
      })

      expect(result.error).toBeUndefined()
    })

    it('DutchV3 order with negative relativeAmounts passes response validation', async () => {
      // Same order but with negative relativeAmounts
      const v3order: GetDutchV3OrderResponse = JSON.parse('{"outputs":[{"recipient":"0x250a94c03b9b57c93cc5549760d59d6eacfb136d","minAmount":"6097025","startAmount":"6119175","curve":{"relativeAmounts":["-22150"],"relativeBlocks":[8]},"token":"0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8","adjustmentPerGweiBaseFee":"0"}],"filler_offerer_orderStatus":"0x0000000000000000000000000000000000000000_0x250a94c03b9b57c93cc5549760d59d6eacfb136d_open","reactor":"0xb274d5f4b833b61b340b654d600a864fb604a87c","offerer_orderStatus":"0x250a94c03b9b57c93cc5549760d59d6eacfb136d_open","encodedOrder":"0x000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000e00000000000000000000000004449cd34d1eb1fedcf02a1be3834ffde8e6a6180000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001c000000000000000000000000000000000000000000000000000000000000002e000000000000000000000000000000000000000000000000000000000000004600000000000000000000000000000000000000000000000000000000000000540000000000000000000000000b274d5f4b833b61b340b654d600a864fb604a87c000000000000000000000000250a94c03b9b57c93cc5549760d59d6eacfb136df038f18e74bf2b1cbb5d94d8029d443414976bd38efec768706eca33b004fa0000000000000000000000000000000000000000000000000000000000674ec602000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000c0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000082af49447d8a07e3bd95bd0d56f35241523fbab100000000000000000000000000000000000000000000000000060a24181e400000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000060a24181e40000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000020000000000000000000000000ff970a61a04b1ca14834a43f5de4533ebddb5cc800000000000000000000000000000000000000000000000000000000005d5f0700000000000000000000000000000000000000000000000000000000000000c0000000000000000000000000250a94c03b9b57c93cc5549760d59d6eacfb136d00000000000000000000000000000000000000000000000000000000005d0881000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000056860000000000000000000000000000000000000000000000000000000010bd7baa00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000041d1c99bcbee1bed23ee847cfe3d501f034f23b8ba67c249dc07a2ca7c376dd9c04f31eabe9dd15d9b3464cd72196975fbb71a1455233afe0d1050e312c58976fc1b00000000000000000000000000000000000000000000000000000000000000","requestId":"6fe3b04d-658a-4529-af66-76bcdd7d5265","signature":"0xaebea601f90e77d5ae72f5c28a14ccc71e88ac61e2af0fc8f45278c1367696fb080ddebb4b66b05559d5fe34533f756844b279fecc18c562233d9b0a2fbb870a1c","deadline":1733215746,"cosignature":"0xd1c99bcbee1bed23ee847cfe3d501f034f23b8ba67c249dc07a2ca7c376dd9c04f31eabe9dd15d9b3464cd72196975fbb71a1455233afe0d1050e312c58976fc1b","cosignerData":{"exclusiveFiller":"0x0000000000000000000000000000000000000000","inputOverride":"0","outputOverrides":["0"],"decayStartBlock":280853418},"modified":"2024-12-03T08:44:07.702Z","input":{"startAmount":"1700000000000000","maxAmount":"1700000000000000","curve":{"relativeAmounts":["0"],"relativeBlocks":[8]},"token":"0x82aF49447D8a07e3bd95BD0d56f35241523fBab1","adjustmentPerGweiBaseFee":"0"},"filler":"0x0000000000000000000000000000000000000000","orderStatus":"open","chainId_orderStatus_filler":"42161_open_0x0000000000000000000000000000000000000000","createdAt":1733215447,"chainId_filler":"42161_0x0000000000000000000000000000000000000000","entity":"Order","quoteId":"6fe3b04d-658a-4529-af66-76bcdd7d5265","filler_offerer":"0x0000000000000000000000000000000000000000_0x250a94c03b9b57c93cc5549760d59d6eacfb136d","filler_orderStatus":"0x0000000000000000000000000000000000000000_open","created":"2024-12-03T08:44:07.702Z","chainId":42161,"orderHash":"0xa694497e3644c2ce58a22b4b3fcd6004e3faf8057dc409a70da08aea85a92b4b","chainId_orderStatus":"42161_open","nonce":"108655694257088393948171748675121105290610995892134912696918847811839007717888","startingBaseFee":"0","type":"Dutch_V3","swapper":"0x250a94c03b9b57c93cc5549760d59d6eacfb136d"}');
      const responseSchema = Joi.alternatives(GetDutchV3OrderResponseEntryJoi);
      const result = responseSchema.validate(v3order, {
        allowUnknown: true,
        stripUnknown: true, // Ensure no unexpected fields returned to users.
      })

      expect(result.error).toBeUndefined()
    });
  })

  describe('parseGetQueryParams multi-status parsing', () => {
    it('parses a single orderStatus as a string', () => {
      const result = parseGetQueryParams({ orderStatus: 'open' } as any)
      expect(result.queryFilters.orderStatus).toEqual('open')
    })

    it('parses comma-separated orderStatus into an array', () => {
      const result = parseGetQueryParams({ orderStatus: 'open,insufficient-funds' } as any)
      expect(result.queryFilters.orderStatus).toEqual(['open', 'insufficient-funds'])
    })

    it('parses three comma-separated statuses into an array', () => {
      const result = parseGetQueryParams({ orderStatus: 'open,filled,expired' } as any)
      expect(result.queryFilters.orderStatus).toEqual(['open', 'filled', 'expired'])
    })

    it('dedupes a repeated status', () => {
      const result = parseGetQueryParams({ orderStatus: 'open,filled,open' } as any)
      expect(result.queryFilters.orderStatus).toEqual(['open', 'filled'])
    })

    it('does not split a single status with no comma', () => {
      const result = parseGetQueryParams({ orderStatus: 'insufficient-funds' } as any)
      expect(result.queryFilters.orderStatus).toEqual('insufficient-funds')
    })

    it('omits orderStatus when not provided', () => {
      const result = parseGetQueryParams({ chainId: 1 } as any)
      expect(result.queryFilters.orderStatus).toBeUndefined()
    })
  })

  describe('pagination contract', () => {
    const NEXT_CURSOR = 'eylckhhc2giOiIweDAwMDAwMDAwMDwMDAwM4Nzg2NjgifQ=='
    const REQUEST_CURSOR = 'eyJvcmRlckhhc2giOiIweGRlYWRiZWVmNTcxNDAzIn0='

    it('GET /orders never returns a cursor, even when the repository reports more rows', async () => {
      // The cached first page reports a cursor whenever the partition holds more rows; a
      // single-page endpoint must not hand out a cursor it would reject on the next request.
      getOrdersMock.mockReturnValue({ orders: [MOCK_ORDER], cursor: NEXT_CURSOR })
      const handler = new GetOrdersHandler('get-orders', injectorPromiseMock, mock<OrderDispatcher>())

      const response = await handler.handler({ queryStringParameters: { orderStatus: 'open' } } as any, {} as any)

      expect(response.statusCode).toEqual(200)
      expect(JSON.parse(response.body)).toEqual({ orders: [MOCK_ORDER] })
    })

    it.each([
      [{ orderStatus: 'open', sortKey: 'createdAt' }],
      [{ orderStatus: 'open', sortKey: 'createdAt', sort: 'gt(0)' }],
      [{ orderStatus: 'open', sortKey: 'createdAt', desc: 'true' }],
      [{ orderStatus: 'open', sortKey: 'createdAt', sort: 'gt(0)', desc: 'true' }],
    ])('GET /orders accepts default-valued sort params %p, strips them and serves the first page', async (queryStringParameters) => {
      // They describe exactly the page the endpoint serves, so a client that always sent them
      // keeps working; the repository sees a plain query and the response has no cursor.
      getOrdersMock.mockReturnValue({ orders: [MOCK_ORDER], cursor: NEXT_CURSOR })
      const handler = new GetOrdersHandler(
        'get-orders',
        {
          ...injectorPromiseMock,
          getRequestInjected: (_c: any, _b: any, validatedQueryParams: any) => ({
            ...requestInjectedMock,
            ...parseGetQueryParams(validatedQueryParams),
          }),
        },
        mock<OrderDispatcher>()
      )

      const response = await handler.handler({ queryStringParameters } as any, {} as any)

      expect(response.statusCode).toEqual(200)
      expect(getOrdersMock).toBeCalledWith(0, { orderStatus: 'open' }, undefined)
      expect(JSON.parse(response.body)).toEqual({ orders: [MOCK_ORDER] })
    })

    it.each([
      [{ orderStatus: 'open', cursor: REQUEST_CURSOR }, 'cursor\\" is not supported. GET /orders returns a single page'],
      [{ orderStatus: 'open', sortKey: 'createdAt', desc: 'false' }, 'desc\\" may only be true. GET /orders returns a single page'],
      [{ orderStatus: 'open', sortKey: 'createdAt', sort: 'gt(1675881506)' }, 'sort\\" may only be gt(0). GET /orders returns a single page'],
      [{ orderStatus: 'open', sortKey: 'createdAt', sort: 'between(1,2)' }, 'sort\\" may only be gt(0). GET /orders returns a single page'],
      [{ orderStatus: 'open', sortKey: 'createdBy' }, 'must be [createdAt]'],
    ])('GET /orders rejects non-default paging or sort params %p with a 400', async (queryStringParameters, message) => {
      // A client that actually relied on paging or another ordering must find out.
      const handler = new GetOrdersHandler('get-orders', injectorPromiseMock, mock<OrderDispatcher>())

      const response = await handler.handler({ queryStringParameters } as any, {} as any)

      expect(getOrdersMock).not.toHaveBeenCalled()
      expect(response.statusCode).toEqual(400)
      expect(response.body).toEqual(expect.stringContaining(message))
    })

    it('GET /orders schema strips default-valued sort params rather than passing them on', () => {
      const { error, value } = GetOrdersQueryParamsJoi.validate(
        { orderStatus: 'open', sortKey: 'createdAt', sort: 'gt(0)', desc: true },
        { allowUnknown: true, stripUnknown: true }
      )
      expect(error).toBeUndefined()
      expect(value).toEqual({ orderStatus: 'open' })
    })

    it('GET /orders ignores an injected cursor even if one slips past validation', async () => {
      getOrdersMock.mockReturnValue({ orders: [MOCK_ORDER] })
      const handler = new GetOrdersHandler(
        'get-orders',
        { ...injectorPromiseMock, getRequestInjected: () => ({ ...requestInjectedMock, cursor: REQUEST_CURSOR }) },
        mock<OrderDispatcher>()
      )

      await handler.handler({ queryStringParameters: { orderStatus: 'open' } } as any, {} as any)

      expect(getOrdersMock).toBeCalledWith(requestInjectedMock.limit, queryFiltersMock, undefined)
    })

    it('GET /orders strips the cursor from dispatcher responses too', async () => {
      const dispatcher = mock<OrderDispatcher>()
      dispatcher.getOrder.mockResolvedValue({ orders: [MOCK_ORDER], cursor: NEXT_CURSOR } as any)
      const handler = new GetOrdersHandler(
        'get-orders',
        { ...injectorPromiseMock, getRequestInjected: () => ({ ...requestInjectedMock, orderType: 'Dutch' }) },
        dispatcher
      )

      const response = await handler.handler(
        { queryStringParameters: { orderStatus: 'open', orderType: 'Dutch' } } as any,
        {} as any
      )

      expect(response.statusCode).toEqual(200)
      expect(JSON.parse(response.body)).toEqual({ orders: [MOCK_ORDER] })
    })

    it('GET /limit-orders accepts a cursor, passes it to the repository and returns the next one', async () => {
      getOrdersMock.mockReturnValue({ orders: [MOCK_ORDER], cursor: NEXT_CURSOR })
      const handler = new GetOrdersHandler(
        'get-limit-orders',
        { ...injectorPromiseMock, getRequestInjected: () => ({ ...requestInjectedMock, cursor: REQUEST_CURSOR }) },
        mock<OrderDispatcher>(),
        GET_LIMIT_ORDERS_HANDLER_OPTIONS
      )

      const response = await handler.handler(
        { queryStringParameters: { orderStatus: 'open', cursor: REQUEST_CURSOR } } as any,
        {} as any
      )

      expect(getOrdersMock).toBeCalledWith(requestInjectedMock.limit, queryFiltersMock, REQUEST_CURSOR)
      expect(response.statusCode).toEqual(200)
      expect(JSON.parse(response.body)).toEqual({ orders: [MOCK_ORDER], cursor: NEXT_CURSOR })
    })

    it.each([
      [{ orderStatus: 'open', sortKey: 'createdAt' }],
      [{ orderStatus: 'open', sortKey: 'createdAt', sort: 'gt(4)' }],
      [{ orderStatus: 'open', sortKey: 'createdAt', desc: 'true' }],
    ])('GET /limit-orders still accepts sort parameters %p', async (queryStringParameters) => {
      const handler = new GetOrdersHandler(
        'get-limit-orders',
        injectorPromiseMock,
        mock<OrderDispatcher>(),
        GET_LIMIT_ORDERS_HANDLER_OPTIONS
      )

      const response = await handler.handler({ queryStringParameters } as any, {} as any)

      expect(response.statusCode).toEqual(200)
    })

    // The rules that used to be tested against GET /orders now live only on the limit-orders schema.
    it.each([
      [{ orderStatus: 'open', sort: 'gt(4)' }, '\\"sortKey\\" is required'],
      [{ orderStatus: 'open', desc: true }, '\\"sortKey\\" is required'],
      [{ orderStatus: 'open', sortKey: 'createdBy' }, 'must be [createdAt]'],
      [{ orderStatus: 'open', sortKey: 'createdAt', sort: 'foo(bar)' }, 'fails to match the required pattern'],
      [{ orderStatus: 'open', sortKey: 'createdAt', desc: 'yes' }, '\\"desc\\" must be a boolean'],
      [{ orderStatus: 'open', cursor: 'not base64 $$$' }, 'must be a valid base64 string'],
      [
        { orderHashes: MOCK_ORDER.orderHash, sortKey: 'createdAt' },
        'Querying with both orderHashes and sortKey is not currently supported.',
      ],
    ])('GET /limit-orders keeps its own validation rules: %p', async (queryStringParameters, message) => {
      const handler = new GetOrdersHandler(
        'get-limit-orders',
        injectorPromiseMock,
        mock<OrderDispatcher>(),
        GET_LIMIT_ORDERS_HANDLER_OPTIONS
      )

      const response = await handler.handler({ queryStringParameters } as any, {} as any)

      expect(getOrdersMock).not.toHaveBeenCalled()
      expect(response.statusCode).toEqual(400)
      expect(response.body).toEqual(expect.stringContaining(message))
    })
  })

  describe('query filter validation bounds the partition keys a caller can name', () => {
    // chainId and orderStatus are the only values that reach the cached partitions, and both
    // are enum-checked; everything else is shape-checked so random values are rejected.
    it.each([
      [{ chainId: 999999 }, 'must be one of'],
      [{ chainId: 'abc' }, 'chainId'],
      [{ orderStatus: 'open,notastatus' }, 'contains an invalid value'],
      [{ pair: 'has a space' }, 'fails to match the required pattern'],
      [{ pair: 'x'.repeat(129) }, 'length must be less than or equal to 128'],
      [{ chainId: 1, limit: -1 }, 'must be greater than or equal to 0'],
      [{ chainId: 1, limit: 0.5 }, 'must be an integer'],
      [{ filler: '0x1234' }, 'Invalid address'],
    ])('rejects %p', async (queryStringParameters, message) => {
      const handler = new GetOrdersHandler('get-orders', injectorPromiseMock, mock<OrderDispatcher>())

      const response = await handler.handler({ queryStringParameters } as any, {} as any)

      expect(getOrdersMock).not.toHaveBeenCalled()
      expect(response.statusCode).toEqual(400)
      expect(response.body).toEqual(expect.stringContaining(message))
    })

    it('accepts a well-formed pair', async () => {
      const handler = new GetOrdersHandler('get-orders', injectorPromiseMock, mock<OrderDispatcher>())

      const response = await handler.handler(
        {
          queryStringParameters: {
            pair: '0x0000000000000000000000000000000000000000-0x1111111111111111111111111111111111111111-1',
          },
        } as any,
        {} as any
      )

      expect(response.statusCode).toEqual(200)
    })
  })
})
