import { Logger } from '@aws-lambda-powertools/logger'
import { mock } from 'jest-mock-extended'
import { EVENT_CONTEXT } from '../../fixtures'
import { GetUnimindHandler } from '../../../../lib/handlers/get-unimind/handler'
import { QuoteMetadataRepository } from '../../../../lib/repositories/quote-metadata-repository'
import { UnimindParametersRepository } from '../../../../lib/repositories/unimind-parameters-repository'
import { ErrorCode } from '../../../../lib/handlers/base'

const SAMPLE_ROUTE = {
  quote: "1234",
  quoteGasAdjusted: "5678",
  gasPriceWei: "1234",
  gasUseEstimateQuote: "2345",
  gasUseEstimate: "3456",
  methodParameters: {
    calldata: "0xabcdef",
    value: "1234",
    to: "0abcdef"
  }
} as const

const STRINGIFIED_ROUTE = JSON.stringify(SAMPLE_ROUTE)

describe('Testing get unimind handler', () => {
  const mockLog = mock<Logger>()
  const mockQuoteMetadataRepo = mock<QuoteMetadataRepository>()
  const mockUnimindParametersRepo = mock<UnimindParametersRepository>()

  const requestInjected = {
    requestId: 'testRequest',
    log: mockLog,
  }

  const injectorPromiseMock: any = {
    getContainerInjected: () => ({
      quoteMetadataRepository: mockQuoteMetadataRepo,
      unimindParametersRepository: mockUnimindParametersRepo
    }),
    getRequestInjected: () => requestInjected,
  }

  const getUnimindHandler = new GetUnimindHandler('getUnimindHandler', injectorPromiseMock)

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('Testing valid request and response', async () => {
    const quoteMetadata = {
      quoteId: 'test-quote-id',
      pair: 'ETH-USDC',
      referencePrice: '4221.21',
      priceImpact: 0.01,
      route: STRINGIFIED_ROUTE,
    }

    mockUnimindParametersRepo.getByPair.mockResolvedValue({
      pair: 'ETH-USDC',
      pi: 3.14,
      tau: 4.2,
      count: 0
    })

    const response = await getUnimindHandler.handler(
      {
        queryStringParameters: quoteMetadata,
        requestContext: {
          requestId: 'test-request-id'
        }
      } as any,
      EVENT_CONTEXT
    )

    const body = JSON.parse(response.body)
    expect(body).toEqual({
      pi: 3.14 * 0.01,
      tau: 4.2 * 0.01
    })
    expect(response.statusCode).toBe(200)
    expect(mockQuoteMetadataRepo.put).toHaveBeenCalledWith({
      ...quoteMetadata,
      route: SAMPLE_ROUTE // Should be parsed object when stored
    })
    expect(mockUnimindParametersRepo.getByPair).toHaveBeenCalledWith('ETH-USDC')
  })

  it('Returns default parameters when not found in unimindParametersRepository', async () => {
    const quoteMetadata = {
      quoteId: 'test-quote-id',
      referencePrice: '4221.21',
      priceImpact: 0.01,
      pair: 'ALAN-LEN',
      route: STRINGIFIED_ROUTE,
    }

    mockUnimindParametersRepo.getByPair.mockResolvedValue(undefined)

    const response = await getUnimindHandler.handler(
      {
        queryStringParameters: quoteMetadata,
        requestContext: {
          requestId: 'test-request-id'
        }
      } as any,
      EVENT_CONTEXT
    )
    //Handler should have saved the quote metadata since we expect params in response
    expect(mockQuoteMetadataRepo.put).toHaveBeenCalledWith({
      ...quoteMetadata,
      route: JSON.parse(quoteMetadata.route)
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body).toEqual({
      pi: expect.any(Number),
      tau: expect.any(Number)
    })
  })

  it('Returns empty parameters when expectParams is false', async () => {
    const quoteMetadata = {
      quoteId: 'this-should-work',
      referencePrice: '100',
      priceImpact: 0.1,
      pair: '0xabc-0xdef',
      route: STRINGIFIED_ROUTE,
    }

    const quoteQueryParams = {
      ...quoteMetadata,
      logOnly: true
    }

    const response = await getUnimindHandler.handler(
      {
        queryStringParameters: quoteQueryParams,
        requestContext: {
          requestId: 'test-request-id'
        }
      } as any,
      EVENT_CONTEXT
    )

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body).toEqual({
      pi: 0,
      tau: 0
    })

    // Quote metadata should be saved
    expect(mockQuoteMetadataRepo.put).toHaveBeenCalledWith({
      ...quoteMetadata,
      route: JSON.parse(quoteMetadata.route)
    })
  })

  it('Appends QuoteMetadata, Does not append UnimindParameters if expectParams is false', async () => {
    const quoteMetadata = {
      quoteId: 'this-should-work',
      referencePrice: '100',
      priceImpact: 0.1,
      pair: 'ETH-USDC',
      route: STRINGIFIED_ROUTE,
    }

    const quoteQueryParams = {
      ...quoteMetadata,
      logOnly: true
    }

    // This pair does not exist in unimindParametersRepository
    mockUnimindParametersRepo.getByPair.mockResolvedValue(undefined)

    const response = await getUnimindHandler.handler(
      {
        queryStringParameters: quoteQueryParams,
        requestContext: {
          requestId: 'test-request-id'
        }
      } as any,
      EVENT_CONTEXT
    )

    expect(mockQuoteMetadataRepo.put).toHaveBeenCalledWith({
      ...quoteMetadata,
      route: JSON.parse(quoteMetadata.route)
    })
    expect(mockUnimindParametersRepo.put).not.toHaveBeenCalled()
    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body).toEqual({
      pi: 0,
      tau: 0
    })
  })

  it('Returns correct CORS headers', async () => {
    const response = await getUnimindHandler.handler(
      {
        queryStringParameters: { 
          quoteId: 'this-should-work', 
          referencePrice: '100', 
          priceImpact: 0.1,
          pair: 'ETH-USDC',
          route: STRINGIFIED_ROUTE
        },
        requestContext: { requestId: 'test-request-id-cors' }
      } as any,
      EVENT_CONTEXT
    )

    expect(response.headers).toEqual({
      'Access-Control-Allow-Credentials': true,
      'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json',
    })
  })

  it('fails when missing required fields', async () => {
    const incompleteValues = {
      quoteId: 'this-should-fail',
      // missing fields
      priceImpact: 0.01
    }

    const response = await getUnimindHandler.handler(
      {
        queryStringParameters: incompleteValues,
        requestContext: {
          requestId: 'test-request-id-missing-fields'
        }
      } as any,
      EVENT_CONTEXT
    )

    expect(response.statusCode).toBe(400)
    expect(mockQuoteMetadataRepo.put).not.toHaveBeenCalled()
  })

  it('fails when repository throws error', async () => {
    const quoteMetadata = {
      quoteId: 'this-should-fail',
      pair: 'ETH-USDC',
      referencePrice: '666.56',
      priceImpact: 0.01,
      route: STRINGIFIED_ROUTE,
    }

    mockQuoteMetadataRepo.put.mockRejectedValue(new Error('DB Error'))

    const response = await getUnimindHandler.handler(
      {
        queryStringParameters: quoteMetadata,
        requestContext: {
          requestId: 'test-request-id-repo-error'
        }
      } as any,
      EVENT_CONTEXT
    )

    expect(response.statusCode).toBe(500)
    const body = JSON.parse(response.body)
    expect(body.errorCode).toBe(ErrorCode.InternalError)
    expect(body.detail).toBe('DB Error')
    expect(mockQuoteMetadataRepo.put).toHaveBeenCalledWith({
      ...quoteMetadata,
      route: SAMPLE_ROUTE // Should be parsed object when stored
    })
  })

  it('fails when route is invalid JSON', async () => {
    const getRequestParams = {
      quoteId: 'test-quote-id',
      pair: 'ETH-USDC',
      referencePrice: '4221.21',
      priceImpact: 0.01,
      route: '{invalid json'
    }

    const response = await getUnimindHandler.handler(
      {
        queryStringParameters: getRequestParams,
        requestContext: {
          requestId: 'test-request-id'
        }
      } as any,
      EVENT_CONTEXT
    )

    expect(response.statusCode).toBe(400)
    const body = JSON.parse(response.body)
    expect(body.detail).toContain('route must be a valid JSON string')
  })

  it('rejects case-sensitive variations of "true" for logOnly', async () => {
    const quoteMetadata = {
      quoteId: 'test-quote-id',
      referencePrice: '4221.21',
      priceImpact: 0.01,
      pair: 'ETH-USDC',
      route: STRINGIFIED_ROUTE,
    }

    const variations = ['TrUe', 'TRUE', 'True']

    for (const valueToTest of variations) {
      mockQuoteMetadataRepo.put.mockClear()
      mockUnimindParametersRepo.getByPair.mockClear()

      const response = await getUnimindHandler.handler(
        {
          queryStringParameters: { ...quoteMetadata, logOnly: valueToTest },
          requestContext: {
            requestId: 'test-request-id'
          }
        } as any,
        EVENT_CONTEXT
      )

      expect(response.statusCode).toBe(400)
      expect(mockQuoteMetadataRepo.put).not.toHaveBeenCalled()
      expect(mockUnimindParametersRepo.getByPair).not.toHaveBeenCalled()
    }
  })

  it('rejects case-sensitive variations of "false" for logOnly', async () => {
    const quoteMetadata = {
      quoteId: 'test-quote-id',
      referencePrice: '4221.21',
      priceImpact: 0.01,
      pair: 'ETH-USDC',
      route: STRINGIFIED_ROUTE,
    }

    const variations = ['FALSE', 'False', 'fAlSe']

    for (const valueToTest of variations) {
      mockQuoteMetadataRepo.put.mockClear()
      mockUnimindParametersRepo.getByPair.mockClear()

      const response = await getUnimindHandler.handler(
        {
          queryStringParameters: { ...quoteMetadata, logOnly: valueToTest },
          requestContext: {
            requestId: 'test-request-id'
          }
        } as any,
        EVENT_CONTEXT
      )

      expect(response.statusCode).toBe(400)
      expect(mockQuoteMetadataRepo.put).not.toHaveBeenCalled()
      expect(mockUnimindParametersRepo.getByPair).not.toHaveBeenCalled()
    }
  })

  it('logOnly works when we pass in true', async () => {
    const quoteMetadata = {
      quoteId: 'test-quote-id',
      referencePrice: '4221.21',
      priceImpact: 0.01,
      pair: 'ETH-USDC',
      route: STRINGIFIED_ROUTE,
    }
    //mock the put as successful
    mockQuoteMetadataRepo.put.mockResolvedValue()

    const response = await getUnimindHandler.handler(
      {
        queryStringParameters: { ...quoteMetadata, logOnly: 'true' },
        requestContext: {
          requestId: 'test-request-id'
        }
      } as any,
      EVENT_CONTEXT
    )

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body).toEqual({
      pi: 0,
      tau: 0
    })
    expect(mockQuoteMetadataRepo.put).toHaveBeenCalledTimes(1)
    expect(mockUnimindParametersRepo.getByPair).toHaveBeenCalledTimes(0)
  })

  it('logOnly does not run when we pass in false', async () => {
    const quoteMetadata = {
      quoteId: 'test-quote-id',
      referencePrice: '4221.21',
      priceImpact: 0.01,
      pair: 'ETH-USDC',
      route: STRINGIFIED_ROUTE,
    }

    const response = await getUnimindHandler.handler(
      {
        queryStringParameters: { ...quoteMetadata, logOnly: 'false' },
        requestContext: {
          requestId: 'test-request-id'
        }
      } as any,
      EVENT_CONTEXT
    )

    expect(response.statusCode).toBe(200)
    expect(mockQuoteMetadataRepo.put).toHaveBeenCalledTimes(1)
    expect(mockUnimindParametersRepo.getByPair).toHaveBeenCalledTimes(1)
  })

  it('Allow route to be optional', async () => {
    const quoteMetadata = {
      quoteId: 'test-quote-id',
      referencePrice: '4221.21',
      priceImpact: 0.01,
      pair: 'ETH-USDC',
      blockNumber: 1234,
      // missing route
    }

    const response = await getUnimindHandler.handler(
      {
        queryStringParameters: quoteMetadata,
        requestContext: { requestId: 'test-request-id' }
      } as any,
      EVENT_CONTEXT
    )

    expect(response.statusCode).toBe(200)
    expect(mockQuoteMetadataRepo.put).toHaveBeenCalledTimes(1)
    expect(mockUnimindParametersRepo.getByPair).toHaveBeenCalledTimes(1)
  })

  it('blockNumber is optional', async () => {
    const quoteMetadata = {
      quoteId: 'test-quote-id',
      referencePrice: '4221.21',
      priceImpact: 0.01,
      pair: 'ETH-USDC',
      // missing blockNumber
      route: STRINGIFIED_ROUTE,
    }

    const response = await getUnimindHandler.handler(
      {
        queryStringParameters: quoteMetadata,
        requestContext: { requestId: 'test-request-id' }
      } as any,
      EVENT_CONTEXT
    )

    expect(response.statusCode).toBe(200)
    expect(mockQuoteMetadataRepo.put).toHaveBeenCalledTimes(1)
    expect(mockUnimindParametersRepo.getByPair).toHaveBeenCalledTimes(1)
  })
})
