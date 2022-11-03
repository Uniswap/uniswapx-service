import { GetNonceHandler } from '../../lib/handlers/get-nonce/handler'

describe('Testing get nonce handler.', () => {
  const MOCK_ADDRESS = '0x11E4857Bb9993a50c685A79AFad4E6F65D518DDa'
  const MOCK_NONCE = '123'

  // Creating mocks for all the handler dependencies.
  const getNonceByAddressMock = jest.fn()

  const requestInjectedMock = {
    address: MOCK_ADDRESS,
    log: { info: () => jest.fn(), error: () => jest.fn() },
  }
  const injectorPromiseMock: any = {
    getContainerInjected: () => {
      return {
        dbInterface: {
          getNonceByAddress: getNonceByAddressMock,
        },
      }
    },
    getRequestInjected: () => requestInjectedMock,
  }
  const event = {
    queryStringParameters: {
      address: MOCK_ADDRESS,
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
    expect(getNonceByAddressMock).toBeCalledWith(requestInjectedMock.address)
    expect(getNonceResponse).toEqual({
      body: JSON.stringify({ nonce: MOCK_NONCE }),
      statusCode: 200,
      headers: expect.anything(),
    })
  })

  describe('Testing invalid nonce request validation.', () => {
    it.each([
      [{ address: '123' }, '"address\\" failed custom validation because invalid address'],
      [{ address: '' }, '"address\\" is not allowed to be empty"'],
      [
        { address: '0xF53bDa7e0337BD456cDcDab0Ab24Db43E738065' },
        '"address\\" failed custom validation because invalid address',
      ],
      [{}, '"address\\" is required'],
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
        expect(getNonceByAddressMock).toBeCalledWith(requestInjectedMock.address)
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
      expect(getNonceByAddressMock).toBeCalledWith(requestInjectedMock.address)
      expect(getNonceResponse).toEqual({
        body: JSON.stringify({ errorCode: error.message }),
        statusCode: 500,
        headers: expect.anything(),
      })
    })
  })
})
