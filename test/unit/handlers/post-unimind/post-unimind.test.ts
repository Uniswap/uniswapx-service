import { Logger } from '@aws-lambda-powertools/logger'
import { mock } from 'jest-mock-extended'
import { EVENT_CONTEXT } from '../../fixtures'
import { PostUnimindHandler } from '../../../../lib/handlers/post-unimind/handler'
import { QuoteMetadataRepository } from '../../../../lib/repositories/quote-metadata-repository'
import { UnimindParametersRepository } from '../../../../lib/repositories/unimind-parameters-repository'

const SAMPLE_ROUTE = {
  quote: "1234",
  quote_gas_adjusted: "5678",
  gas_price_wei: "1234",
  gas_use_estimate_quote: "2345",
  gas_use_estimate: "3456",
  method_parameters: {
    calldata: "0xabcdef",
    value: "1234",
    to: "0abcdef"
  }
} as const

describe('Testing post unimind handler', () => {
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

  const postUnimindHandler = new PostUnimindHandler('postUnimindHandler', injectorPromiseMock)

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('Testing valid request and response', async () => {
    const postRequestBody = {
      quoteId: 'test-quote-id',
      pair: 'ETH-USDC',
      referencePrice: '4221.21',
      priceImpact: 0.01,
      route: SAMPLE_ROUTE
    }

    mockUnimindParametersRepo.getByPair.mockResolvedValue({
      pair: 'ETH-USDC',
      pi: 3.14,
      tau: 4.2
    })

    const response = await postUnimindHandler.handler(
      {
        body: JSON.stringify(postRequestBody),
        requestContext: {
          requestId: 'test-request-id'
        }
      } as any,
      EVENT_CONTEXT
    )

    const body = JSON.parse(response.body)
    expect(body).toEqual({
      pi: 3.14 * 0.01, // intrinsic.pi * extrinsic.priceImpact
      tau: 4.2 * 0.01  // intrinsic.tau * extrinsic.priceImpact
    })
    expect(response.statusCode).toBe(200)
    expect(mockQuoteMetadataRepo.put).toHaveBeenCalledWith(postRequestBody)
    expect(mockUnimindParametersRepo.getByPair).toHaveBeenCalledWith('ETH-USDC')
  })

  it('Returns 404 when unimind parameters not found', async () => {
    const quoteMetadata = {
      quoteId: 'test-quote-id',
      referencePrice: '4221.21',
      priceImpact: 0.01,
      pair: 'ALAN-LEN',
      route: SAMPLE_ROUTE
    }

    mockUnimindParametersRepo.getByPair.mockResolvedValue(undefined)

    const response = await postUnimindHandler.handler(
      {
        body: JSON.stringify(quoteMetadata),
        requestContext: {
          requestId: 'test-request-id'
        }
      } as any,
      EVENT_CONTEXT
    )

    expect(response.statusCode).toBe(404)
    const body = JSON.parse(response.body)
    expect(body.errorCode).toBe('NO_UNIMIND_PARAMETERS_FOUND')
    expect(body.detail).toBe('No unimind parameters found for ALAN-LEN')
  })

  it('Returns correct CORS headers', async () => {
    const response = await postUnimindHandler.handler(
      {
        body: JSON.stringify({ 
          quoteId: 'this-should-work', 
          referencePrice: '100', 
          priceImpact: 0.1,
          pair: 'ETH-USDC'
        }),
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
      // missing referencePrice and pair
      priceImpact: 0.01
    }

    const response = await postUnimindHandler.handler(
      {
        body: JSON.stringify(incompleteValues),
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
    const postRequestBody = {
      quoteId: 'this-should-fail',
      pair: 'ETH-USDC',
      referencePrice: '666.56',
      priceImpact: 0.01,
      route: SAMPLE_ROUTE
    }

    mockQuoteMetadataRepo.put.mockRejectedValueOnce(new Error('DB Error'))

    const response = await postUnimindHandler.handler(
      {
        body: JSON.stringify(postRequestBody),
        requestContext: {
          requestId: 'test-request-id-repo-error'
        }
      } as any,
      EVENT_CONTEXT
    )

    expect(response.statusCode).toBe(500)
    expect(mockQuoteMetadataRepo.put).toHaveBeenCalledWith(postRequestBody)
  })
}) 