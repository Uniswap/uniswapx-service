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
  }

  // Creating mocks for all the handler dependencies.
  const getOrdersMock = jest.fn()
  const queryFiltersMock = {
    offerer: MOCK_ORDER.offerer,
    sellToken: '0x6B3595068778DD592e39A122f4f5a5cF09C90fE2',
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

  describe('Testing invalid request validation.', () => {
    it.each([
      [{ orderHash: '0xbad_hash' }, 'orderHash\\" with value \\"0xbad_hash\\" fails to match the required pattern'],
      [{ offerer: '0xbad_address' }, 'VALIDATION ERROR: Invalid address'],
      [
        { orderStatus: 'bad_status' },
        'must be one of [open, filled, cancelled, expired, error, unverified, insufficient-funds]',
      ],
      [{ sellToken: '0xcorn' }, 'VALIDATION ERROR: Invalid address'],
      [{ limit: 'bad_limit' }, 'must be a number'],
      [{ filler: '0xcorn' }, 'VALIDATION ERROR: Invalid address'],
      [{ sortKey: 'createdBy' }, 'must be [createdAt]'],
      [{ sort: 'foo(bar)' }, '"foo(bar)\\" fails to match the required pattern'],
      [{ cursor: 1 }, 'must be a string'],
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

    it.each([[{ sortKey: 'createdAt' }], [{ sort: 'gt(4)' }]])(
      'Throws 400 when only %p query param is present',
      async (queryFilters) => {
        const badInjectedMock = {
          getContainerInjected: () => jest.mock,
          getRequestInjected: () => {
            return {
              queryFilters: queryFilters,
              log: { info: () => jest.fn(), error: () => jest.fn() },
            }
          },
        }
        const getOrdersResponse = await getOrdersHandler(badInjectedMock).handler(event as any, {} as any)
        expect(getOrdersResponse.statusCode).toEqual(400)
        expect(getOrdersResponse.body).toEqual(
          expect.stringContaining('Need both a sortKey and sort for a sorted query.')
        )
        expect(getOrdersResponse.body).toEqual(expect.stringContaining('VALIDATION_ERROR'))
      }
    )
  })

  describe('Testing invalid response validation.', () => {
    it.each([
      [{ orderHash: '0xbad_hash' }],
      [{ offerer: '0xbad_address' }],
      [{ orderStatus: 'bad_status' }],
      [{ signature: '0xbad_sig' }],
      [{ encodedOrder: '0xencoded$$$order' }],
      [{ createdAt: 'bad_created_at' }],
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
