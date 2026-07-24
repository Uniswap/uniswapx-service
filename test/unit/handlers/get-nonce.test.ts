import { GetNonceHandler } from '../../../lib/handlers/get-nonce/handler'
import { SUPPORTED_CHAINS } from '../../../lib/util/chain'
import { findUnusedNonce } from '../../../lib/util/nonce'
import { HeaderExpectation } from '../../HeaderExpectation'

jest.mock('../../../lib/util/nonce', () => ({
  ...jest.requireActual('../../../lib/util/nonce'),
  findUnusedNonce: jest.fn(),
}))

describe('Testing get nonce handler.', () => {
  const MOCK_ADDRESS = '0x11E4857Bb9993a50c685A79AFad4E6F65D518DDa'
  const MOCK_NONCE = '123'

  // Creating mocks for all the handler dependencies.
  const getNonceByAddressMock = jest.fn()
  const providerMapGetMock = jest.fn()
  const findUnusedNonceMock = findUnusedNonce as jest.Mock
  const mockProvider = { _isProvider: true }

  const requestInjectedMock = {
    address: MOCK_ADDRESS,
    chainId: 1,
    log: { info: () => jest.fn(), warn: () => jest.fn(), error: () => jest.fn(), debug: () => jest.fn() },
  }
  const injectorPromiseMock: any = {
    getContainerInjected: () => {
      return {
        dbInterface: {
          getNonceByAddressAndChain: getNonceByAddressMock,
        },
        providerMap: {
          get: providerMapGetMock,
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
    providerMapGetMock.mockReturnValue(mockProvider)
    // by default the on-chain check finds the stored nonce still unused and returns it unchanged
    findUnusedNonceMock.mockImplementation(
      async (_provider: unknown, _chainId: number, _address: string, lastUsedNonce: string) => lastUsedNonce
    )
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('Testing valid request and response.', async () => {
    const getNonceResponse = await getNonceHandler.handler(event as any, {} as any)
    expect(getNonceByAddressMock).toBeCalledWith(requestInjectedMock.address.toLowerCase(), 1)
    expect(findUnusedNonceMock).toBeCalledWith(mockProvider, 1, MOCK_ADDRESS, MOCK_NONCE)
    expect(getNonceResponse).toMatchObject({
      body: JSON.stringify({ nonce: MOCK_NONCE }),
      statusCode: 200,
    })

    expect(getNonceResponse.headers).not.toBeUndefined()
    const headerExpectation = new HeaderExpectation(getNonceResponse.headers)
    headerExpectation.toAllowAllOrigin().toAllowCredentials().toReturnJsonContentType()
  })

  describe('Testing on-chain nonce check.', () => {
    it('Returns the on-chain adjusted nonce when the stored nonce is stale.', async () => {
      const adjustedNonce = '456'
      findUnusedNonceMock.mockResolvedValueOnce(adjustedNonce)
      const getNonceResponse = await getNonceHandler.handler(event as any, {} as any)
      expect(getNonceResponse).toMatchObject({
        body: JSON.stringify({ nonce: adjustedNonce }),
        statusCode: 200,
      })
    })

    it('Falls back to the stored nonce when the on-chain check fails.', async () => {
      findUnusedNonceMock.mockRejectedValueOnce(new Error('rpc error'))
      const getNonceResponse = await getNonceHandler.handler(event as any, {} as any)
      expect(getNonceResponse).toMatchObject({
        body: JSON.stringify({ nonce: MOCK_NONCE }),
        statusCode: 200,
      })
    })

    it('Falls back to the stored nonce when no provider is available for the chain.', async () => {
      providerMapGetMock.mockReturnValueOnce(undefined)
      const getNonceResponse = await getNonceHandler.handler(event as any, {} as any)
      expect(findUnusedNonceMock).not.toHaveBeenCalled()
      expect(getNonceResponse).toMatchObject({
        body: JSON.stringify({ nonce: MOCK_NONCE }),
        statusCode: 200,
      })
    })

    it('Falls back to the stored nonce when building the provider throws.', async () => {
      providerMapGetMock.mockImplementationOnce(() => {
        throw new Error('RPC_PREFIX_URL not set')
      })
      const getNonceResponse = await getNonceHandler.handler(event as any, {} as any)
      expect(findUnusedNonceMock).not.toHaveBeenCalled()
      expect(getNonceResponse).toMatchObject({
        body: JSON.stringify({ nonce: MOCK_NONCE }),
        statusCode: 200,
      })
    })
  })

  describe('Testing invalid nonce request validation.', () => {
    it.each([
      [{ address: '123' }, 'VALIDATION ERROR: Invalid address'],
      [{ address: '' }, '"address\\" is not allowed to be empty"'],
      [{ address: '0xF53bDa7e0337BD456cDcDab0Ab24Db43E738065' }, 'VALIDATION ERROR: Invalid address'],
      [{}, '"address\\" is required'],
      [{ address: MOCK_ADDRESS, chainId: 'foo' }, `\\"chainId\\" must be one of [${SUPPORTED_CHAINS.join(', ')}]`],
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
