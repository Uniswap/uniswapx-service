import { Logger } from '@aws-lambda-powertools/logger'
import { OrderType } from '@uniswap/uniswapx-sdk'
import { mock } from 'jest-mock-extended'
import { ORDER_STATUS, SORT_FIELDS } from '../../../lib/entities'
import { GetOrdersHandler } from '../../../lib/handlers/get-orders/handler'
import { OrderDispatcher } from '../../../lib/services/OrderDispatcher'
import { SUPPORTED_CHAINS } from '../../../lib/util/chain'
import { HeaderExpectation } from '../../HeaderExpectation'
import { REQUEST_ID } from '../fixtures'
import Joi from 'joi'
import { GetDutchV3OrderResponse, GetDutchV3OrderResponseEntryJoi } from '../../../lib/handlers/get-orders/schema/GetDutchV3OrderResponse'

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
        relativeBlocks: ['1', '2', '3'],
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
          relativeBlocks: ['1', '2', '3'],
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

  it('Testing valid request and response, Priority order', async () => {
    const getOrdersHandler = (injectedMock = injectorPromiseMock) =>
      new GetOrdersHandler('get-orders', injectedMock, mock<OrderDispatcher>())
    getOrdersMock.mockReturnValue({
      orders: [MOCK_PRIORITY_ORDER],
      cursor: 'eylckhhc2giOiIweDAwMDAwMDAwMDwMDAwM4Nzg2NjgifQ==',
    })

    const getOrdersResponse = await getOrdersHandler().handler({} as any, {} as any)

    expect(getOrdersMock).toBeCalledWith(requestInjectedMock.limit, queryFiltersMock, requestInjectedMock.cursor)
    expect(getOrdersResponse).toMatchObject({
      body: JSON.stringify({
        orders: [MOCK_PRIORITY_ORDER],
        cursor: 'eylckhhc2giOiIweDAwMDAwMDAwMDwMDAwM4Nzg2NjgifQ==',
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
      cursor: 'eylckhhc2giOiIweDAwMDAwMDAwMDwMDAwM4Nzg2NjgifQ==',
    })

    const getOrdersResponse = await getOrdersHandler().handler({} as any, {} as any)

    expect(getOrdersMock).toBeCalledWith(requestInjectedMock.limit, queryFiltersMock, requestInjectedMock.cursor)
    expect(getOrdersResponse).toMatchObject({
      body: JSON.stringify({
        orders: [MOCK_V3_ORDER],
        cursor: 'eylckhhc2giOiIweDAwMDAwMDAwMDwMDAwM4Nzg2NjgifQ==',
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
        `{"detail":"\\"chainId\\" must be one of [${SUPPORTED_CHAINS.join(', ')}]","errorCode":"VALIDATION_ERROR"}`,
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

  describe.only('response validation', () => {
    it('DutchV3 order passes response validation', async () => {

      const v3order: GetDutchV3OrderResponse = JSON.parse('{"outputs":[{"recipient":"0x250a94c03b9b57c93cc5549760d59d6eacfb136d","minAmount":"6097025","startAmount":"6119175","curve":{"relativeAmounts":["22150"],"relativeBlocks":[8]},"token":"0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8","adjustmentPerGweiBaseFee":"0"}],"filler_offerer_orderStatus":"0x0000000000000000000000000000000000000000_0x250a94c03b9b57c93cc5549760d59d6eacfb136d_open","reactor":"0xb274d5f4b833b61b340b654d600a864fb604a87c","offerer_orderStatus":"0x250a94c03b9b57c93cc5549760d59d6eacfb136d_open","encodedOrder":"0x000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000e00000000000000000000000004449cd34d1eb1fedcf02a1be3834ffde8e6a6180000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001c000000000000000000000000000000000000000000000000000000000000002e000000000000000000000000000000000000000000000000000000000000004600000000000000000000000000000000000000000000000000000000000000540000000000000000000000000b274d5f4b833b61b340b654d600a864fb604a87c000000000000000000000000250a94c03b9b57c93cc5549760d59d6eacfb136df038f18e74bf2b1cbb5d94d8029d443414976bd38efec768706eca33b004fa0000000000000000000000000000000000000000000000000000000000674ec602000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000c0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000082af49447d8a07e3bd95bd0d56f35241523fbab100000000000000000000000000000000000000000000000000060a24181e400000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000060a24181e40000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000020000000000000000000000000ff970a61a04b1ca14834a43f5de4533ebddb5cc800000000000000000000000000000000000000000000000000000000005d5f0700000000000000000000000000000000000000000000000000000000000000c0000000000000000000000000250a94c03b9b57c93cc5549760d59d6eacfb136d00000000000000000000000000000000000000000000000000000000005d0881000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000056860000000000000000000000000000000000000000000000000000000010bd7baa00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000041d1c99bcbee1bed23ee847cfe3d501f034f23b8ba67c249dc07a2ca7c376dd9c04f31eabe9dd15d9b3464cd72196975fbb71a1455233afe0d1050e312c58976fc1b00000000000000000000000000000000000000000000000000000000000000","requestId":"6fe3b04d-658a-4529-af66-76bcdd7d5265","signature":"0xaebea601f90e77d5ae72f5c28a14ccc71e88ac61e2af0fc8f45278c1367696fb080ddebb4b66b05559d5fe34533f756844b279fecc18c562233d9b0a2fbb870a1c","deadline":1733215746,"cosignature":"0xd1c99bcbee1bed23ee847cfe3d501f034f23b8ba67c249dc07a2ca7c376dd9c04f31eabe9dd15d9b3464cd72196975fbb71a1455233afe0d1050e312c58976fc1b","cosignerData":{"exclusiveFiller":"0x0000000000000000000000000000000000000000","inputOverride":"0","outputOverrides":["0"],"decayStartBlock":280853418},"modified":"2024-12-03T08:44:07.702Z","input":{"startAmount":"1700000000000000","maxAmount":"1700000000000000","curve":{"relativeAmounts":["0"],"relativeBlocks":[8]},"token":"0x82aF49447D8a07e3bd95BD0d56f35241523fBab1","adjustmentPerGweiBaseFee":"0"},"filler":"0x0000000000000000000000000000000000000000","orderStatus":"open","chainId_orderStatus_filler":"42161_open_0x0000000000000000000000000000000000000000","createdAt":1733215447,"chainId_filler":"42161_0x0000000000000000000000000000000000000000","entity":"Order","quoteId":"6fe3b04d-658a-4529-af66-76bcdd7d5265","filler_offerer":"0x0000000000000000000000000000000000000000_0x250a94c03b9b57c93cc5549760d59d6eacfb136d","filler_orderStatus":"0x0000000000000000000000000000000000000000_open","created":"2024-12-03T08:44:07.702Z","chainId":42161,"orderHash":"0xa694497e3644c2ce58a22b4b3fcd6004e3faf8057dc409a70da08aea85a92b4b","chainId_orderStatus":"42161_open","nonce":"108655694257088393948171748675121105290610995892134912696918847811839007717888","startingBaseFee":"0","type":"Dutch_V3","swapper":"0x250a94c03b9b57c93cc5549760d59d6eacfb136d"}');
      const responseSchema = Joi.alternatives(GetDutchV3OrderResponseEntryJoi);
      const result = responseSchema.validate(v3order, {
        allowUnknown: true,
        stripUnknown: true, // Ensure no unexpected fields returned to users.
      })

      expect(result.error).toBeUndefined()
    })
  })
})
