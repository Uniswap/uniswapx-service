import { OrderType } from '@uniswap/gouda-sdk'
import { ORDER_STATUS, SORT_FIELDS } from '../../lib/entities'
import { GetOrdersHandler } from '../../lib/handlers/get-orders/handler'
import { HeaderExpectation } from '../utils'

describe('Testing get orders handler.', () => {
  const MOCK_ORDER = {
    signature:
      '0x1c33da80f46194b0db3398de4243d695dfa5049c4cc341e80f5b630804a47f2f52b9d16cb65b2a2d8ed073da4b295c7cb3ccc13a49a16a07ad80b796c31b283414',
    orderStatus: ORDER_STATUS.OPEN,
    orderHash: '0xa2444ef606a0d99809e1878f7b819541618f2b7990bb9a7275996b362680cae4',
    offerer: '0x11E4857Bb9993a50c685A79AFad4E6F65D518DDa',
    createdAt: 1667276283251,
    encodedOrder: '0xencoded000order',
    type: OrderType.DutchLimit,
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

  // Creating mocks for all the handler dependencies.
  const getOrdersMock = jest.fn()
  const queryFiltersMock = {
    offerer: MOCK_ORDER.offerer,
    filler: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
    orderStatus: ORDER_STATUS.OPEN,
    sortKey: SORT_FIELDS.CREATED_AT,
    sort: `eq(${MOCK_ORDER.createdAt})`,
  }
  const requestInjectedMock = {
    limit: 10,
    cursor: 'eyJvcmRlckhhc2giOiIweGRlYWRiZWVmNTcxNDAzIn0=',
    queryFilters: queryFiltersMock,
    log: { info: () => jest.fn(), error: () => jest.fn() },
  }
  const injectorPromiseMock: any = {
    getContainerInjected: () => {
      return {
        dbInterface: {
          getOrders: getOrdersMock,
        },
      }
    },
    getRequestInjected: () => requestInjectedMock,
  }
  const event = {
    queryStringParameters: queryFiltersMock,
    body: null,
  }

  const getOrdersHandler = (injectedMock = injectorPromiseMock) => new GetOrdersHandler('get-orders', injectedMock)

  beforeAll(async () => {
    getOrdersMock.mockReturnValue({ orders: [MOCK_ORDER], cursor: 'eylckhhc2giOiIweDAwMDAwMDAwMDwMDAwM4Nzg2NjgifQ==' })
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('Testing valid request and response.', async () => {
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

  it('Testing valid request and response with chainId.', async () => {
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
      [{ offerer: '0xbad_address' }, 'VALIDATION ERROR: Invalid address'],
      [{ orderStatus: 'bad_status' }, 'must be one of [open, filled, cancelled, expired, error, insufficient-funds]'],
      [{ limit: 'bad_limit' }, 'must be a number'],
      [{ filler: '0xcorn' }, 'VALIDATION ERROR: Invalid address'],
      [{ sortKey: 'createdBy' }, 'must be [createdAt]'],
      [
        { sortKey: 'createdAt' },
        '{"detail":"\\"value\\" must contain at least one of [orderStatus, offerer, filler, chainId]","errorCode":"VALIDATION_ERROR"}',
      ],
      [{ sort: 'foo(bar)' }, '"foo(bar)\\" fails to match the required pattern'],
      [{ cursor: 1 }, 'must be a string'],
      [{ sort: 'gt(4)' }, '{"detail":"\\"sortKey\\" is required","errorCode":"VALIDATION_ERROR"}'],
      [{ chainId: 420 }, '{"detail":"\\"chainId\\" must be one of [1, TENDERLY, 137]","errorCode":"VALIDATION_ERROR"}'],
      [{ desc: true }, '{"detail":"\\"sortKey\\" is required","errorCode":"VALIDATION_ERROR"}'],
      [
        { desc: 'yes', sortKey: 'createdAt', orderStatus: 'expired' },
        '{"detail":"\\"desc\\" must be a boolean","errorCode":"VALIDATION_ERROR"}',
      ],
      [
        { chainId: 1, offerer: '0x11E4857Bb9993a50c685A79AFad4E6F65D518DDa' },
        '{"detail":"Querying with both offerer and chainId is not currently supported.","errorCode":"VALIDATION_ERROR"}',
      ],
    ])('Throws 400 with invalid query param %p', async (invalidQueryParam, bodyMsg) => {
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
      [{ offerer: '0xbad_address' }],
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
        body: JSON.stringify({ errorCode: error.message }),
        statusCode: 500,
      })

      expect(getOrdersResponse.headers).not.toBeUndefined()
      const headerExpectation = new HeaderExpectation(getOrdersResponse.headers)
      headerExpectation.toAllowAllOrigin().toAllowCredentials().toReturnJsonContentType()
    })
  })
})
