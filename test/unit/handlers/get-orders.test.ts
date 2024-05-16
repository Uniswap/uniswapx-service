import { Logger } from '@aws-lambda-powertools/logger'
import { OrderType } from '@uniswap/uniswapx-sdk'
import { mock } from 'jest-mock-extended'
import { ORDER_STATUS, SORT_FIELDS } from '../../../lib/entities'
import { GetOrdersHandler } from '../../../lib/handlers/get-orders/handler'
import { OrderDispatcher } from '../../../lib/services/OrderDispatcher'
import { HeaderExpectation } from '../../HeaderExpectation'
import { REQUEST_ID } from '../fixtures'

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

  const MOCK_V2_ORDER = {
    signature:
      '0x1c33da80f46194b0db3398de4243d695dfa5049c4cc341e80f5b630804a47f2f52b9d16cb65b2a2d8ed073da4b295c7cb3ccc13a49a16a07ad80b796c31b283414',
    orderStatus: ORDER_STATUS.OPEN,
    orderHash: '0xbfa41c91a61907aa4023a9f98da5ea1b18ea109bd092a62fc896299874019e19',
    swapper: '0x11E4857Bb9993a50c685A79AFad4E6F65D518DDa',
    encodedOrder:
      '0x00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000de0b6b3a76400000000000000000000000000000000000000000000000000000de0b6b3a7640000000000000000000000000000000000000000000000000000000000000000022000000000000000000000000000000000000000000000000000000000000002c000000000000000000000000000000000000000000000000000000000000003c00000000000000000000000003867393cc6ea7b0414c2c3e1d9fe7cea987fd06600000000000000000000000011e4857bb9993a50c685a79afad4e6f65d518dda000000000000000000000000000000000000000000000000000000000000006400000000000000000000000000000000000000000000000000000000660dd05e000000000000000000000000222222222222222222222222222222222222222200000000000000000000000000000000000000000000000000000000000000c00000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000660dd05e0000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000029a2241af62c00000000000000000000000000000000000000000000000000001bc16d674ec8000000000000000000000000000011e4857bb9993a50c685a79afad4e6f65d518dda00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000de0b6b3a764000000000000000000000000000000000000000000000000000000000000000000c0000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000029a2241af62c000000000000000000000000000000000000000000000000000000000000000000411c33da80f46194b0db3398de4243d695dfa5049c4cc341e80f5b630804a47f2f52b9d16cb65b2a2d8ed073da4b295c7cb3ccc13a49a16a07ad80b796c31b28341400000000000000000000000000000000000000000000000000000000000000',
    type: OrderType.Dutch_V2,
    chainId: 1,
    input: {
      token: '0x0000000000000000000000000000000000000000',
      startAmount: '1000000000000000000',
      endAmount: '1000000000000000000',
    },
    cosignerData: {
      decayStartTime: 1,
      decayEndTime: 3,
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
        endAmount: '2000000000000000000',
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
      sortKey: SORT_FIELDS.CREATED_AT,
      sort: `eq(${MOCK_ORDER.createdAt})`,
    }
    requestInjectedMock = {
      limit: 10,
      cursor: 'eyJvcmRlckhhc2giOiIweGRlYWRiZWVmNTcxNDAzIn0=',
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
    getOrdersMock.mockReturnValue({ orders: [MOCK_ORDER], cursor: 'eylckhhc2giOiIweDAwMDAwMDAwMDwMDAwM4Nzg2NjgifQ==' })
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
    expect(getOrdersMock).toBeCalledWith(requestInjectedMock.limit, queryFiltersMock, requestInjectedMock.cursor)
    expect(getOrdersResponse).toMatchObject({
      body: JSON.stringify({ orders: [MOCK_ORDER], cursor: 'eylckhhc2giOiIweDAwMDAwMDAwMDwMDAwM4Nzg2NjgifQ==' }),
      statusCode: 200,
    })
    expect(getOrdersResponse.headers).not.toBeUndefined()
    const headerExpectation = new HeaderExpectation(getOrdersResponse.headers)
    headerExpectation.toAllowAllOrigin().toAllowCredentials().toReturnJsonContentType()
  })

  it('Testing valid request and response for Dutch_V2 without includeV2 flag, removes Dutch_V2 orders', async () => {
    const getOrdersHandler = (injectedMock = injectorPromiseMock) =>
      new GetOrdersHandler('get-orders', injectedMock, mock<OrderDispatcher>())

    getOrdersMock.mockReturnValue({
      orders: [MOCK_ORDER, MOCK_V2_ORDER],
      cursor: 'eylckhhc2giOiIweDAwMDAwMDAwMDwMDAwM4Nzg2NjgifQ==',
    })
    const getOrdersResponse = await getOrdersHandler().handler({} as any, {} as any)

    expect(getOrdersMock).toBeCalledWith(requestInjectedMock.limit, queryFiltersMock, requestInjectedMock.cursor)
    expect(getOrdersResponse).toMatchObject({
      body: JSON.stringify({ orders: [MOCK_ORDER], cursor: 'eylckhhc2giOiIweDAwMDAwMDAwMDwMDAwM4Nzg2NjgifQ==' }),
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
      sortKey: SORT_FIELDS.CREATED_AT,
      sort: `eq(${MOCK_ORDER.createdAt})`,
    }
    const getOrdersResponse = await getOrdersHandler({
      ...injectorPromiseMock,
      getRequestInjected: () => ({
        ...requestInjectedMock,
        queryFilters: tempQueryFilters,
      }),
    }).handler({ ...event, queryStringParameters: tempQueryFilters } as any, {} as any)
    expect(getOrdersMock).toBeCalledWith(requestInjectedMock.limit, tempQueryFilters, requestInjectedMock.cursor)
    expect(getOrdersResponse).toMatchObject({
      body: JSON.stringify({ orders: [MOCK_ORDER], cursor: 'eylckhhc2giOiIweDAwMDAwMDAwMDwMDAwM4Nzg2NjgifQ==' }),
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
      [{ orderStatus: 'bad_status' }, 'must be one of [open, filled, cancelled, expired, error, insufficient-funds]'],
      [{ limit: 'bad_limit' }, 'must be a number'],
      [{ filler: '0xcorn' }, 'VALIDATION ERROR: Invalid address'],
      [{ sortKey: 'createdBy' }, 'must be [createdAt]'],
      [
        { sortKey: 'createdAt' },
        '{"detail":"\\"value\\" must contain at least one of [orderHash, orderHashes, chainId, orderStatus, swapper, filler]","errorCode":"VALIDATION_ERROR"}',
      ],
      [{ sort: 'foo(bar)' }, '"foo(bar)\\" fails to match the required pattern'],
      [{ cursor: 1 }, 'must be a string'],
      [{ sort: 'gt(4)' }, '{"detail":"\\"sortKey\\" is required","errorCode":"VALIDATION_ERROR"}'],
      [
        { chainId: 420 },
        '{"detail":"\\"chainId\\" must be one of [1, 137, 11155111, 5]","errorCode":"VALIDATION_ERROR"}',
      ],
      [{ desc: true }, '{"detail":"\\"sortKey\\" is required","errorCode":"VALIDATION_ERROR"}'],
      [
        { desc: 'yes', sortKey: 'createdAt', orderStatus: 'expired' },
        '{"detail":"\\"desc\\" must be a boolean","errorCode":"VALIDATION_ERROR"}',
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
      expect(getOrdersMock).toBeCalledWith(
        requestInjectedMock.limit,
        requestInjectedMock.queryFilters,
        requestInjectedMock.cursor
      )
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
      expect(getOrdersMock).toBeCalledWith(
        requestInjectedMock.limit,
        requestInjectedMock.queryFilters,
        requestInjectedMock.cursor
      )
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
        expect(getOrdersMock).toBeCalledWith(
          requestInjectedMock.limit,
          requestInjectedMock.queryFilters,
          requestInjectedMock.cursor
        )
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
      expect(getOrdersMock).toBeCalledWith(
        requestInjectedMock.limit,
        requestInjectedMock.queryFilters,
        requestInjectedMock.cursor
      )
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
      expect(getOrdersMock).toBeCalledWith(
        requestInjectedMock.limit,
        requestInjectedMock.queryFilters,
        requestInjectedMock.cursor
      )
      expect(getOrdersResponse.statusCode).toEqual(200)
      expect(JSON.parse(getOrdersResponse.body).orders[0].quoteId).not.toBeDefined()
    })
  })
})
