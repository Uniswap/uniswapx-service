import { Logger } from '@aws-lambda-powertools/logger'
import { mock } from 'jest-mock-extended'
import { EVENT_CONTEXT } from '../../fixtures'
import { PostUnimindHandler } from '../../../../lib/handlers/post-unimind/handler'
import { ExtrinsicValuesRepository } from '../../../../lib/repositories/extrinsic-values-repository'
import { IntrinsicValuesRepository } from '../../../../lib/repositories/intrinsic-values-repository'

describe('Testing post unimind handler', () => {
  const mockLog = mock<Logger>()
  const mockExtrinsicValuesRepo = mock<ExtrinsicValuesRepository>()
  const mockIntrinsicValuesRepo = mock<IntrinsicValuesRepository>()

  const requestInjected = {
    requestId: 'testRequest',
    log: mockLog,
  }

  const injectorPromiseMock: any = {
    getContainerInjected: () => ({
      extrinsicValuesRepository: mockExtrinsicValuesRepo,
      intrinsicValuesRepository: mockIntrinsicValuesRepo
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
      priceImpact: 0.01
    }

    const { pair, ...extrinsicValues } = postRequestBody

    mockIntrinsicValuesRepo.getByPair.mockResolvedValue({
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
    expect(mockExtrinsicValuesRepo.put).toHaveBeenCalledWith(extrinsicValues)
    expect(mockIntrinsicValuesRepo.getByPair).toHaveBeenCalledWith('ETH-USDC')
  })

  it('Returns 404 when intrinsic values not found', async () => {
    const extrinsicValues = {
      quoteId: 'test-quote-id',
      referencePrice: '4221.21',
      priceImpact: 0.01,
      pair: 'ALAN-LEN'
    }

    mockIntrinsicValuesRepo.getByPair.mockResolvedValue(undefined)

    const response = await postUnimindHandler.handler(
      {
        body: JSON.stringify(extrinsicValues),
        requestContext: {
          requestId: 'test-request-id'
        }
      } as any,
      EVENT_CONTEXT
    )

    expect(response.statusCode).toBe(404)
    const body = JSON.parse(response.body)
    expect(body.errorCode).toBe('NO_INTRINSIC_VALUES_FOUND')
    expect(body.detail).toBe('No intrinsic values found for ALAN-LEN')
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
    expect(mockExtrinsicValuesRepo.put).not.toHaveBeenCalled()
  })

  it('fails when repository throws error', async () => {
    const postRequestBody = {
      quoteId: 'this-should-fail',
      pair: 'ETH-USDC',
      referencePrice: '666.56',
      priceImpact: 0.01
    }

    const { pair, ...extrinsicValues } = postRequestBody

    mockExtrinsicValuesRepo.put.mockRejectedValueOnce(new Error('DB Error'))

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
    expect(mockExtrinsicValuesRepo.put).toHaveBeenCalledWith(extrinsicValues)
  })
}) 