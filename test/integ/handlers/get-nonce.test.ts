import { GetNonceHandler } from '../../../lib/handlers/get-nonce/handler'
import { HeaderExpectation } from '../../unit/utils'

describe('Testing get nonce handler.', () => {
  const MOCK_ADDRESS = '0x11E4857Bb9993a50c685A79AFad4E6F65D518DDa'
  const MOCK_NONCE = '123'

  // Creating mocks for all the handler dependencies.
  const getNonceByAddressMock = jest.fn()

  const requestInjectedMock = {
    address: MOCK_ADDRESS,
    chainId: 1,
    log: { info: () => jest.fn(), error: () => jest.fn() },
  }
  const injectorPromiseMock: any = {
    getContainerInjected: () => {
      return {
        dbInterface: {
          getNonceByAddressAndChain: getNonceByAddressMock,
        },
      }
    },
    getRequestInjected: () => requestInjectedMock,
  }
  const event = {
    queryStringParameters: {
      address: MOCK_ADDRESS,
      chainId: 1,
    },
    body: null,
  }

  const getNonceHandler = new GetNonceHandler('get-nonce', injectorPromiseMock)

  beforeAll(async () => {
    getNonceByAddressMock.mockReturnValue(MOCK_NONCE)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('Testing valid request and response.', async () => {
    const getNonceResponse = await getNonceHandler.handler(event as any, {} as any)
    expect(getNonceByAddressMock).toBeCalledWith(requestInjectedMock.address.toLowerCase(), 1)
    expect(getNonceResponse).toMatchObject({
      body: JSON.stringify({ nonce: MOCK_NONCE }),
      statusCode: 200,
    })

    expect(getNonceResponse.headers).not.toBeUndefined()
    const headerExpectation = new HeaderExpectation(getNonceResponse.headers)
    headerExpectation.toAllowAllOrigin().toAllowCredentials().toReturnJsonContentType()
  })

  describe('Testing invalid nonce request validation.', () => {
    it.each([
      [{ address: '123' }, 'VALIDATION ERROR: Invalid address'],
      [{ address: '' }, '"address\\" is not allowed to be empty"'],
      [{ address: '0xF53bDa7e0337BD456cDcDab0Ab24Db43E738065' }, 'VALIDATION ERROR: Invalid address'],
      [{}, '"address\\" is required'],
      [{ address: MOCK_ADDRESS, chainId: 'foo' }, '\\"chainId\\" must be one of [1, 5, 137]'],
    ])('Throws 400 with invalid query param %p', async (invalidQueryParam, bodyMsg) => {
      const invalidEvent = {
        ...event,
        queryStringParameters: invalidQueryParam,
      }
      const getNonceResponse = await getNonceHandler.handler(invalidEvent as any, {} as any)
      expect(getNonceByAddressMock).not.toHaveBeenCalled()
      expect(getNonceResponse.statusCode).toEqual(400)
      expect(getNonceResponse.body).toEqual(expect.stringContaining(bodyMsg))
      expect(getNonceResponse.body).toEqual(expect.stringContaining('VALIDATION_ERROR'))
    })
  })

  describe('Testing invalid get nonce response validation.', () => {
    it.each([[{ nonce: 'nonce' }], [{ nonce: '' }]])(
      'Throws 500 with invalid field %p in the response',
      async (invalidResponseField) => {
        getNonceByAddressMock.mockReturnValue(invalidResponseField)
        const getNonceResponse = await getNonceHandler.handler(event as any, {} as any)
        expect(getNonceByAddressMock).toBeCalledWith(requestInjectedMock.address.toLowerCase(), 1)
        expect(getNonceResponse.statusCode).toEqual(500)
        expect(getNonceResponse.body).toEqual(expect.stringContaining('INTERNAL_ERROR'))
      }
    )

    it('Throws 500 when db interface errors out.', async () => {
      const error = new Error('Oh no! This is an error.')
      getNonceByAddressMock.mockImplementation(() => {
        throw error
      })
      const getNonceResponse = await getNonceHandler.handler(event as any, {} as any)
      expect(getNonceByAddressMock).toBeCalledWith(requestInjectedMock.address.toLowerCase(), 1)
      expect(getNonceResponse).toMatchObject({
        body: JSON.stringify({ detail: error.message, errorCode: 'INTERNAL_ERROR' }),
        statusCode: 500,
      })

      expect(getNonceResponse.headers).not.toBeUndefined()
      const headerExpectation = new HeaderExpectation(getNonceResponse.headers)
      headerExpectation.toAllowAllOrigin().toAllowCredentials().toReturnJsonContentType()
    })
  })
})
