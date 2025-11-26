import { Logger } from '@aws-lambda-powertools/logger'
import { mock } from 'jest-mock-extended'
import { EVENT_CONTEXT } from '../../fixtures'
import { calculateParameters, GetUnimindHandler } from '../../../../lib/handlers/get-unimind/handler'
import { QuoteMetadataRepository } from '../../../../lib/repositories/quote-metadata-repository'
import { UnimindParametersRepository } from '../../../../lib/repositories/unimind-parameters-repository'
import { ErrorCode } from '../../../../lib/handlers/base'
import { DEFAULT_UNIMIND_PARAMETERS, TradeType, UNIMIND_ALGORITHM_VERSION, UNIMIND_DEV_SWAPPER_ADDRESS, UNIMIND_LARGE_PRICE_IMPACT_THRESHOLD } from '../../../../lib/util/constants'
import { CommandParser, CommandType } from '@uniswap/universal-router-sdk'
import { Interface } from 'ethers/lib/utils'
import { artemisModifyCalldata, UniversalRouterCalldata } from '../../../../lib/util/UniversalRouterCalldata'
import { UNIMIND_LIST } from '../../../../lib/config/unimind-list'
import { ChainId } from '@uniswap/sdk-core'
import { V4BaseActionsParser } from '@uniswap/v4-sdk'
import { UR_EXECUTE_WITH_DEADLINE_SELECTOR, UR_FUNCTION_SIGNATURES } from '../../../../lib/handlers/constants'
import { PriceImpactStrategy } from '../../../../lib/unimind/priceImpactStrategy'

const SAMPLE_ROUTE = {
  quote: "1234",
  quoteGasAdjusted: "5678",
  gasPriceWei: "1234",
  gasUseEstimateQuote: "2345",
  gasUseEstimate: "3456",
  methodParameters: {
    // Calldata to UR function execute(bytes commands, bytes[] inputs, uint256 deadline)
    // Contains the following commands: V3_SWAP_EXACT_IN, PAY_PORTION, SWEEP
    // Deadline is in the past
    calldata: "0x3593564c000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000067b7da1b00000000000000000000000000000000000000000000000000000000000000030006040000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000300000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000000000180000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000517da02c00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000002b2a06a17cbc6d0032cac2c6696da90f29d39a1a29002710833589fcd6edb6e08f4c7c32d4f71b54bda029130000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000060000000000000000000000000833589fcd6edb6e08f4c7c32d4f71b54bda029130000000000000000000000007ffc3dbf3b2b50ff3a1d5523bc24bb5043837b1400000000000000000000000000000000000000000000000000000000000000190000000000000000000000000000000000000000000000000000000000000060000000000000000000000000833589fcd6edb6e08f4c7c32d4f71b54bda02913000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000133356f6",
    value: "1234",
    to: "0abcdef"
  }
} as const

const SAMPLE_SUPPORTED_UNIMIND_PAIR = `${UNIMIND_LIST[0].address}-${UNIMIND_LIST[1].address}-${ChainId.ARBITRUM_ONE}`
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
      unimindParametersRepository: mockUnimindParametersRepo,
      analyticsService: {
        logUnimindResponse: jest.fn(),
      }
    }),
    getRequestInjected: () => requestInjected,
  }

  const getUnimindHandler = new GetUnimindHandler('getUnimindHandler', injectorPromiseMock)

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('Testing correct request and response', async () => {
    const quoteMetadata = {
      quoteId: 'test-quote-id',
      pair: SAMPLE_SUPPORTED_UNIMIND_PAIR,
      referencePrice: '4221.21',
      priceImpact: 0.01,
      route: STRINGIFIED_ROUTE,
    }
    const quoteQueryParams = {
      ...quoteMetadata,
      swapper: UNIMIND_DEV_SWAPPER_ADDRESS
    }

    mockUnimindParametersRepo.getByPair.mockResolvedValue({
      pair: SAMPLE_SUPPORTED_UNIMIND_PAIR,
      intrinsicValues: JSON.stringify({
        lambda1: 0,
        lambda2: 8,
        Sigma: Math.log(0.00005)
      }),
      version: UNIMIND_ALGORITHM_VERSION,
      count: 0,
      batchNumber: 0
    })

    const response = await getUnimindHandler.handler(
      {
        queryStringParameters: quoteQueryParams,
        requestContext: {
          requestId: 'test-request-id'
        }
      } as any,
      EVENT_CONTEXT
    )

    const body = JSON.parse(response.body)
    expect(body.pi).toBeCloseTo(0.999764, 5)
    expect(body.tau).toBeCloseTo(15.000235519, 5)
    expect(body.batchNumber).toBe(0)
    expect(body.algorithmVersion).toBe(UNIMIND_ALGORITHM_VERSION)
    expect(response.statusCode).toBe(200)
    expect(mockQuoteMetadataRepo.put).toHaveBeenCalledWith({
      ...quoteMetadata,
      route: SAMPLE_ROUTE, // Should be parsed object when stored
      usedUnimind: true
    })
    expect(mockUnimindParametersRepo.getByPair).toHaveBeenCalledWith(SAMPLE_SUPPORTED_UNIMIND_PAIR)
  })

  it('Returns default parameters when not found in unimindParametersRepository', async () => {
    const quoteMetadata = {
      quoteId: 'test-quote-id',
      referencePrice: '4221.21',
      priceImpact: 0.01,
      pair: SAMPLE_SUPPORTED_UNIMIND_PAIR,
      route: STRINGIFIED_ROUTE,
    }
    const quoteQueryParams = {
      ...quoteMetadata,
      swapper: UNIMIND_DEV_SWAPPER_ADDRESS
    }

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
    //Handler should have saved the quote metadata since we expect params in response
    expect(mockQuoteMetadataRepo.put).toHaveBeenCalledWith({
      ...quoteMetadata,
      route: JSON.parse(quoteMetadata.route),
      usedUnimind: true
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body).toEqual({
      pi: expect.any(Number),
      tau: expect.any(Number),
      batchNumber: 0,  // Default when creating new entry
      algorithmVersion: UNIMIND_ALGORITHM_VERSION
    })
  })

  it('Returns based on default parameters when version is not the same', async () => {
    const quoteMetadata = {
      quoteId: 'test-quote-id',
      referencePrice: '4221.21',
      priceImpact: 0.01,
      pair: SAMPLE_SUPPORTED_UNIMIND_PAIR,
      route: STRINGIFIED_ROUTE,
    }

    const quoteQueryParams = {
      ...quoteMetadata,
      swapper: UNIMIND_DEV_SWAPPER_ADDRESS  
    }

    mockUnimindParametersRepo.getByPair.mockResolvedValue({
      pair: SAMPLE_SUPPORTED_UNIMIND_PAIR,
      intrinsicValues: JSON.stringify({
        lambda1: 1,
        lambda2: 8,
        Sigma: Math.log(0.00005)
      }),
      version: UNIMIND_ALGORITHM_VERSION - 1,
      count: 0,
      batchNumber: 0
    })

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
    const expectedUnimindParameters = {
      pair: SAMPLE_SUPPORTED_UNIMIND_PAIR,
      intrinsicValues: DEFAULT_UNIMIND_PARAMETERS, // Should return based on calculations with default parameters
      count: 0,
      version: UNIMIND_ALGORITHM_VERSION,
      batchNumber: 0
    }
    const expectedBody = calculateParameters(new PriceImpactStrategy(), expectedUnimindParameters, {
      quoteId: quoteMetadata.quoteId,
      referencePrice: quoteMetadata.referencePrice,
      priceImpact: quoteMetadata.priceImpact,
      pair: quoteMetadata.pair,
      route: SAMPLE_ROUTE,
      blockNumber: 1,
      usedUnimind: true
    })
    expect(body).toEqual(expectedBody)
  })

  it('Returns empty parameters when logOnly is true', async () => {
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
      tau: 0,
      batchNumber: -1,  // Didn't actually use Unimind for params
      algorithmVersion: -1
    })

    // Quote metadata should be saved
    expect(mockQuoteMetadataRepo.put).toHaveBeenCalledWith(
      expect.objectContaining({
        quoteId: quoteMetadata.quoteId,
        pair: quoteMetadata.pair,
        referencePrice: quoteMetadata.referencePrice,
        priceImpact: quoteMetadata.priceImpact,
        // Omit route since route.methodParameters.calldata may be modified
      })
    )
  })

  it('Appends QuoteMetadata, Does not append UnimindParameters if logOnly is true', async () => {
    const quoteMetadata = {
      quoteId: 'this-should-work',
      referencePrice: '100',
      priceImpact: 0.1,
      pair: '0x0000000000000000000000000000000000000000-0x1111111111111111111111111111111111111111-123',
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

    expect(mockQuoteMetadataRepo.put).toHaveBeenCalledWith(
      expect.objectContaining({
        quoteId: quoteMetadata.quoteId,
        pair: quoteMetadata.pair,
        referencePrice: quoteMetadata.referencePrice,
        priceImpact: quoteMetadata.priceImpact,
        // Omit route since route.methodParameters.calldata may be modified
      })
    )
    expect(mockUnimindParametersRepo.put).not.toHaveBeenCalled()
    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body).toEqual({
      pi: 0,
      tau: 0,
      batchNumber: -1,
      algorithmVersion: -1
    })
  })

  it('Returns correct CORS headers', async () => {
    const response = await getUnimindHandler.handler(
      {
        queryStringParameters: { 
          quoteId: 'this-should-work', 
          referencePrice: '100', 
          priceImpact: 0.1,
          pair: '0x0000000000000000000000000000000000000000-0x1111111111111111111111111111111111111111-123',
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
      quoteId: 'test-quote-0', // This quoteId passes the unimindTradeFilter
      pair: SAMPLE_SUPPORTED_UNIMIND_PAIR,
      referencePrice: '666.56',
      priceImpact: 0.01,
      route: STRINGIFIED_ROUTE,
    }
    const quoteQueryParams = {
      ...quoteMetadata,
      swapper: UNIMIND_DEV_SWAPPER_ADDRESS
    }

    mockQuoteMetadataRepo.put.mockRejectedValue(new Error('DB Error'))

    const response = await getUnimindHandler.handler(
      {
        queryStringParameters: quoteQueryParams,
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
      route: SAMPLE_ROUTE, // Should be parsed object when stored
      usedUnimind: true
    })
  })

  it('fails when route is invalid JSON', async () => {
    const getRequestParams = {
      quoteId: 'test-quote-id',
      pair: '0x0000000000000000000000000000000000000000-0x1111111111111111111111111111111111111111-123',
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
      pair: '0x0000000000000000000000000000000000000000-0x1111111111111111111111111111111111111111-123',
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
      pair: '0x0000000000000000000000000000000000000000-0x1111111111111111111111111111111111111111-123',
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
      pair: '0x0000000000000000000000000000000000000000-0x1111111111111111111111111111111111111111-123',
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
      tau: 0,
      batchNumber: -1,  // Didn't actually use Unimind for params
      algorithmVersion: -1
    })
    expect(mockQuoteMetadataRepo.put).toHaveBeenCalledTimes(1)
    expect(mockUnimindParametersRepo.getByPair).toHaveBeenCalledTimes(0)
  })

  it('logOnly does not run when we pass in false', async () => {
    const quoteMetadata = {
      quoteId: 'test-quote-id',
      referencePrice: '4221.21',
      priceImpact: 0.01,
      pair: SAMPLE_SUPPORTED_UNIMIND_PAIR,
      route: STRINGIFIED_ROUTE,
      swapper: UNIMIND_DEV_SWAPPER_ADDRESS
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
      pair: SAMPLE_SUPPORTED_UNIMIND_PAIR,
      swapper: UNIMIND_DEV_SWAPPER_ADDRESS,
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
      pair: SAMPLE_SUPPORTED_UNIMIND_PAIR,
      swapper: UNIMIND_DEV_SWAPPER_ADDRESS,
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

  // Tests for new sampling behavior
  describe('Token list and sampling behavior', () => {
    const NOT_ON_LIST_PAIR = '0x0000000000000000000000000000000000000000-0x1111111111111111111111111111111111111111-123'

    it('Both tokens on list → always uses Unimind (no sampling)', async () => {
      const quoteMetadata = {
        quoteId: 'test-on-list-quote', // Any quoteId should work for tokens on list
        pair: SAMPLE_SUPPORTED_UNIMIND_PAIR,
        referencePrice: '4221.21',
        priceImpact: 0.01,
        route: STRINGIFIED_ROUTE,
      }
      const quoteQueryParams = {
        ...quoteMetadata,
        swapper: UNIMIND_DEV_SWAPPER_ADDRESS
      }

      mockUnimindParametersRepo.getByPair.mockResolvedValue({
        pair: SAMPLE_SUPPORTED_UNIMIND_PAIR,
        intrinsicValues: JSON.stringify({
          lambda1: 0,
          lambda2: 8,
          Sigma: Math.log(0.00005)
        }),
        version: UNIMIND_ALGORITHM_VERSION,
        count: 0,
        batchNumber: 0
      })

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
      // Should receive Unimind parameters, not PUBLIC_STATIC_PARAMETERS (which has pi=15, tau=15)
      expect(body.pi).not.toBe(15)
      expect(body.tau).not.toBe(15)
      expect(body.batchNumber).not.toBe(-1)
      expect(mockQuoteMetadataRepo.put).toHaveBeenCalledWith({
        ...quoteMetadata,
        route: SAMPLE_ROUTE,
        usedUnimind: true
      })
      expect(mockLog.info).toHaveBeenCalledWith(
        expect.objectContaining({
          group: 'treatment',
          reason: 'both_tokens_on_unimind_list'
        }),
        expect.stringContaining('both tokens on Unimind list')
      )
    })

    it('Not on list + passes filter (66%) → uses Unimind', async () => {
      const quoteMetadata = {
        quoteId: 'test-quote-0', // This quoteId passes unimindTradeFilter
        pair: NOT_ON_LIST_PAIR,
        referencePrice: '4221.21',
        priceImpact: 0.01,
        route: STRINGIFIED_ROUTE,
      }
      const quoteQueryParams = {
        ...quoteMetadata,
        swapper: UNIMIND_DEV_SWAPPER_ADDRESS
      }

      mockUnimindParametersRepo.getByPair.mockResolvedValue({
        pair: NOT_ON_LIST_PAIR,
        intrinsicValues: JSON.stringify({
          lambda1: 0,
          lambda2: 8,
          Sigma: Math.log(0.00005)
        }),
        version: UNIMIND_ALGORITHM_VERSION,
        count: 0,
        batchNumber: 0
      })

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
      // Should receive Unimind parameters, not PUBLIC_STATIC_PARAMETERS
      expect(body.pi).not.toBe(15)
      expect(body.tau).not.toBe(15)
      expect(body.batchNumber).not.toBe(-1)
      expect(mockQuoteMetadataRepo.put).toHaveBeenCalledWith({
        ...quoteMetadata,
        route: SAMPLE_ROUTE,
        usedUnimind: true
      })
      expect(mockLog.info).toHaveBeenCalledWith(
        expect.objectContaining({
          group: 'treatment',
          reason: 'not_on_unimind_list_sampled_in'
        }),
        expect.stringContaining('sampled in')
      )
    })

    it('Not on list + fails filter (34%) → uses PUBLIC_STATIC_PARAMETERS', async () => {
      const quoteMetadata = {
        quoteId: 'test-quote-fail-filter', // This should fail the filter
        pair: NOT_ON_LIST_PAIR,
        referencePrice: '4221.21',
        priceImpact: 0.01,
        route: STRINGIFIED_ROUTE,
      }
      const quoteQueryParams = {
        ...quoteMetadata,
        swapper: UNIMIND_DEV_SWAPPER_ADDRESS
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
      // Should receive PUBLIC_STATIC_PARAMETERS (pi=15, tau=15, batchNumber=-1, algorithmVersion=-1)
      expect(body).toEqual({
        pi: 15,
        tau: 15,
        batchNumber: -1,
        algorithmVersion: -1
      })
      expect(mockQuoteMetadataRepo.put).toHaveBeenCalledWith({
        ...quoteMetadata,
        route: SAMPLE_ROUTE,
        usedUnimind: false
      })
      expect(mockLog.info).toHaveBeenCalledWith(
        expect.objectContaining({
          group: 'control',
          reason: 'not_on_unimind_list_sampled_out'
        }),
        expect.stringContaining('sampled out')
      )
      // Should NOT call unimindParametersRepo since we're using public params
      expect(mockUnimindParametersRepo.getByPair).not.toHaveBeenCalled()
    })
  })
})

describe('Correctly modify URA calldata for Artemis support', () => {
  const mockLog = mock<Logger>()
  const EXECUTOR_ADDRESS = "0xBa38d33ce3166D62733e6269A55036D7Cf794031"
  it('artemisModifyCalldata for execute + deadline', () => {
    // Calldata to UR function execute(bytes commands, bytes[] inputs, uint256 deadline)
    // Contains the following commands: V3_SWAP_EXACT_IN, PAY_PORTION, SWEEP
    // Deadline is in the past
    const calldata = "0x3593564c000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000067b8fcaa0000000000000000000000000000000000000000000000000000000000000003000604000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000030000000000000000000000000000000000000000000000000000000000000060000000000000000000000000000000000000000000000000000000000000018000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000eedd0333ad7e3f2e6000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000002b0b3e328455c4059eeb9e3f84b5543f74e24e7e1b0001f44200000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000006000000000000000000000000042000000000000000000000000000000000000060000000000000000000000005d64d14d2cf4fe5fe4e65b1c7e3d11e18d493091000000000000000000000000000000000000000000000000000000000000001900000000000000000000000000000000000000000000000000000000000000600000000000000000000000004200000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000001a6514a8546b1ab"
    const decoded = CommandParser.parseCalldata(calldata)
    const swapCommand = decoded.commands[0]

    const modifiedCalldata = artemisModifyCalldata(calldata, mockLog, EXECUTOR_ADDRESS)
    const modifiedDecoded = CommandParser.parseCalldata(modifiedCalldata)
    const modifiedSwapCommand = modifiedDecoded.commands[0]
    expect(modifiedSwapCommand).toEqual(swapCommand)
    // Expect Portion to be removed
    expect(modifiedDecoded.commands.find(command => command.commandType === CommandType.PAY_PORTION)).toBeUndefined()
    const sweepInput = modifiedDecoded.commands.find(command => command.commandType === CommandType.SWEEP)
    expect(sweepInput).toBeDefined()
    // Check that the SWEEP recipient is the executor address
    expect(sweepInput?.params.find(param => param.name === 'recipient')?.value).toEqual(EXECUTOR_ADDRESS)
  })

  it('artemisModifyCalldata for execute without deadline', () => {
    // Calldata to UR function execute(bytes commands, bytes[] inputs)
    // Contains the following commands: V3_SWAP_EXACT_IN, PAY_PORTION, SWEEP
    const calldata = "0x24856bc3000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000003000604000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000030000000000000000000000000000000000000000000000000000000000000060000000000000000000000000000000000000000000000000000000000000018000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000eedd0333ad7e3f2e6000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000002b0b3e328455c4059eeb9e3f84b5543f74e24e7e1b0001f44200000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000006000000000000000000000000042000000000000000000000000000000000000060000000000000000000000005d64d14d2cf4fe5fe4e65b1c7e3d11e18d493091000000000000000000000000000000000000000000000000000000000000001900000000000000000000000000000000000000000000000000000000000000600000000000000000000000004200000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000001ba3fb1567e93fe"
    const decoded = CommandParser.parseCalldata(calldata)
    const swapCommand = decoded.commands[0]

    const modifiedCalldata = artemisModifyCalldata(calldata, mockLog, EXECUTOR_ADDRESS)
    const modifiedDecoded = CommandParser.parseCalldata(modifiedCalldata)
    const modifiedSwapCommand = modifiedDecoded.commands[0]
    expect(modifiedSwapCommand).toEqual(swapCommand)
    // Expect Portion to be removed
    expect(modifiedDecoded.commands.find(command => command.commandType === CommandType.PAY_PORTION)).toBeUndefined()
    const sweepInput = modifiedDecoded.commands.find(command => command.commandType === CommandType.SWEEP)
    expect(sweepInput).toBeDefined()
    // Check that the SWEEP recipient is the executor address
    expect(sweepInput?.params.find(param => param.name === 'recipient')?.value).toEqual(EXECUTOR_ADDRESS)
  })

  it('artemisModifyCalldata for UNWRAP_WETH', () => {
    // Contains V3_SWAP_EXACT_IN and UNWRAP_WETH
    const calldata = "0x3593564c000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000067e5b6550000000000000000000000000000000000000000000000000000000000000002000c000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000160000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000034de435f13194096b7ba79b000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000002bc2b2ea7f6218cc37debbafe71361c088329ae09000271042000000000000000000000000000000000000060000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000040000000000000000000000000123ab21e11111a12abcd123f36fee12d21f42c7b00000000000000000000000000000000000000000000000005cff61d130d3651"
    const decoded = CommandParser.parseCalldata(calldata)
    const swapCommand = decoded.commands[0]
    const unwrapCommand = decoded.commands[1]

    const modifiedCalldata = artemisModifyCalldata(calldata, mockLog, EXECUTOR_ADDRESS)
    const modifiedDecoded = CommandParser.parseCalldata(modifiedCalldata)
    const modifiedSwapCommand = modifiedDecoded.commands[0]
    const modifiedUnwrapCommand = modifiedDecoded.commands[1]
    expect(modifiedSwapCommand).toEqual(swapCommand)

    // Confirm the old UNWRAP_WETH command is not to the executor address
    expect(unwrapCommand?.params.find(param => param.name === 'recipient')?.value).not.toEqual(EXECUTOR_ADDRESS)
    // Check that the new UNWRAP_WETH recipient is the executor address
    expect(modifiedUnwrapCommand).toBeDefined()
    expect(modifiedUnwrapCommand?.params.find(param => param.name === 'recipient')?.value).toEqual(EXECUTOR_ADDRESS)
  })

  it('artemisModifyCalldata for V4_SWAP', () => {
    // Contains V4_SWAP
    const calldata = "0x3593564c000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000000000000000000000000000000000006807dfe7000000000000000000000000000000000000000000000000000000000000000110000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000003c0000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000003070b0e000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000030000000000000000000000000000000000000000000000000000000000000060000000000000000000000000000000000000000000000000000000000000022000000000000000000000000000000000000000000000000000000000000002a000000000000000000000000000000000000000000000000000000000000001a00000000000000000000000000000000000000000000000000000000000000020000000000000000000000000078d782b760474a361dda0af3839290b0ef57ad6000000000000000000000000000000000000000000000000000000000000008000000000000000000000000000000000000000000000000000000000005e9baa000000000000000000000000000000000000000000000000000ca3b033869c6400000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000640000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000060000000000000000000000000078d782b760474a361dda0af3839290b0ef57ad600000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000000000000000000000000000007c1b94a0d777eb1a3db8ed461fecdad72fb9af780000000000000000000000000000000000000000000000000000000000000000"
    const ifaceWithDeadline = new Interface([UR_FUNCTION_SIGNATURES[UR_EXECUTE_WITH_DEADLINE_SELECTOR]])

    // Decode original calldata
    const [, originalInputs] = ifaceWithDeadline.decodeFunctionData('execute', calldata)
    const originalV4Input: string = originalInputs[0]
    const { actions: originalActions } = V4BaseActionsParser.parseCalldata(originalV4Input)

    const originalTakeRecipient = originalActions
      .find((a) => a.actionName.toUpperCase() === 'TAKE')
      ?.params.find((p) => p.name === 'recipient')?.value

    // Modify the calldata
    const modifiedCalldata = artemisModifyCalldata(calldata, mockLog, EXECUTOR_ADDRESS)

    // Decode the modified calldata
    const [, modifiedInputs] = ifaceWithDeadline.decodeFunctionData('execute', modifiedCalldata)
    const modifiedV4Input: string = modifiedInputs[0]
    const { actions: modifiedActions } = V4BaseActionsParser.parseCalldata(modifiedV4Input)

    const modifiedTakeRecipient = modifiedActions
      .find((a) => a.actionName.toUpperCase() === 'TAKE')
      ?.params.find((p) => p.name === 'recipient')?.value

    // Check that the TAKE recipient was updated to the executor address
    expect(originalTakeRecipient?.toLowerCase()).not.toEqual(EXECUTOR_ADDRESS.toLowerCase())
    expect(modifiedTakeRecipient?.toLowerCase()).toEqual(EXECUTOR_ADDRESS.toLowerCase())
  })
  
  it('returns empty string when original recipient is still present in modified calldata', () => {
    const calldata = "0x3593564c000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000067b7da1b00000000000000000000000000000000000000000000000000000000000000030006040000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000300000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000000000180000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000517da02c00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000002b2a06a17cbc6d0032cac2c6696da90f29d39a1a29002710833589fcd6edb6e08f4c7c32d4f71b54bda029130000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000060000000000000000000000000833589fcd6edb6e08f4c7c32d4f71b54bda029130000000000000000000000007ffc3dbf3b2b50ff3a1d5523bc24bb5043837b1400000000000000000000000000000000000000000000000000000000000000190000000000000000000000000000000000000000000000000000000000000060000000000000000000000000833589fcd6edb6e08f4c7c32d4f71b54bda02913000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000133356f6"
  
    // Mock only the sweep recipient modification to do nothing
    jest.spyOn(UniversalRouterCalldata.prototype, 'modifySweepRecipient').mockReturnThis();
  
    const result = artemisModifyCalldata(calldata, mockLog, EXECUTOR_ADDRESS)
    expect(result).toBe("")
    expect(mockLog.error).toHaveBeenCalledWith('Error in artemisModifyCalldata', expect.any(Object))
  
    // Clean up the mock
    jest.restoreAllMocks()
  })

  it('getOriginalRecipient returns the correct recipient from sweep command', () => {
    const calldata = "0x3593564c000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000067b7da1b00000000000000000000000000000000000000000000000000000000000000030006040000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000300000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000000000180000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000517da02c00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000002b2a06a17cbc6d0032cac2c6696da90f29d39a1a29002710833589fcd6edb6e08f4c7c32d4f71b54bda029130000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000060000000000000000000000000833589fcd6edb6e08f4c7c32d4f71b54bda029130000000000000000000000007ffc3dbf3b2b50ff3a1d5523bc24bb5043837b1400000000000000000000000000000000000000000000000000000000000000190000000000000000000000000000000000000000000000000000000000000060000000000000000000000000833589fcd6edb6e08f4c7c32d4f71b54bda02913000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000133356f6"

    const modifiedDecoded = CommandParser.parseCalldata(calldata)
    const sweepInput = modifiedDecoded.commands.find(command => command.commandType === CommandType.SWEEP)
    expect(sweepInput).toBeDefined()
    const expectedOriginalRecipient = sweepInput?.params.find(param => param.name === 'recipient')?.value
    
    const router = new UniversalRouterCalldata(calldata, mockLog)
    const originalRecipient = router.getOriginalRecipient()
    
    expect(originalRecipient).toBe(expectedOriginalRecipient)
  })
  
  describe('Testing guardrails', () => {
    it('returns classic parameters (0,0) when lambda2 < 0', () => {
      const strategy = new PriceImpactStrategy()
      const unimindParameters = {
        pair: SAMPLE_SUPPORTED_UNIMIND_PAIR,
        intrinsicValues: JSON.stringify({
          lambda1: 0,
          lambda2: -1, // Lambda2 < 0
          Sigma: Math.log(0.00005)
        }),
        version: UNIMIND_ALGORITHM_VERSION,
        count: 0,
        batchNumber: 0
      }
      const quoteMetadata = {
        quoteId: 'test-quote-id',
        pair: SAMPLE_SUPPORTED_UNIMIND_PAIR,
        referencePrice: '4221.21',
        priceImpact: 0.5, // Valid price impact
        route: SAMPLE_ROUTE,
        blockNumber: 12345,
        usedUnimind: true
      }
      
      const result = calculateParameters(strategy, unimindParameters, quoteMetadata, mockLog)
      
      expect(result.pi).toBe(0)
      expect(result.tau).toBe(0)
      expect(result.batchNumber).toBe(0)  // Actual batchNumber from parameters
      expect(result.algorithmVersion).toBe(UNIMIND_ALGORITHM_VERSION)  // Actual version
      expect(mockLog.info).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'UnimindGuardrailTriggered',
          guardrailType: 'lambda2_negative',
          lambda2: -1
        }),
        expect.stringContaining('Lambda2 < 0')
      )
    })
    
    it(`returns classic parameters (0,0) when price impact > ${UNIMIND_LARGE_PRICE_IMPACT_THRESHOLD}%`, () => {
      const strategy = new PriceImpactStrategy()
      const unimindParameters = {
        pair: SAMPLE_SUPPORTED_UNIMIND_PAIR,
        intrinsicValues: JSON.stringify({
          lambda1: 0,
          lambda2: 8,
          Sigma: Math.log(0.00005)
        }),
        version: UNIMIND_ALGORITHM_VERSION,
        count: 0,
        batchNumber: 0
      }
      const quoteMetadata = {
        quoteId: 'test-quote-id',
        pair: SAMPLE_SUPPORTED_UNIMIND_PAIR,
        referencePrice: '4221.21',
        priceImpact: UNIMIND_LARGE_PRICE_IMPACT_THRESHOLD + 0.5, // > threshold
        route: SAMPLE_ROUTE,
        blockNumber: 12345,
        usedUnimind: true
      }
      
      const result = calculateParameters(strategy, unimindParameters, quoteMetadata, mockLog)
      
      expect(result.pi).toBe(0)
      expect(result.tau).toBe(0)
      expect(result.batchNumber).toBe(0)  // Actual batchNumber from parameters
      expect(result.algorithmVersion).toBe(UNIMIND_ALGORITHM_VERSION)  // Actual version
      expect(mockLog.info).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'UnimindGuardrailTriggered',
          guardrailType: 'price_impact_too_high',
          priceImpact: UNIMIND_LARGE_PRICE_IMPACT_THRESHOLD + 0.5
        }),
        expect.stringContaining(`Price impact > ${UNIMIND_LARGE_PRICE_IMPACT_THRESHOLD}%`)
      )
    })
    
    it(`computes normal parameters when both lambda2 >= 0 and price impact <= ${UNIMIND_LARGE_PRICE_IMPACT_THRESHOLD}%`, () => {
      const strategy = new PriceImpactStrategy()
      const unimindParameters = {
        pair: SAMPLE_SUPPORTED_UNIMIND_PAIR,
        intrinsicValues: JSON.stringify({
          lambda1: 0,
          lambda2: 8,
          Sigma: Math.log(0.00005)
        }),
        version: UNIMIND_ALGORITHM_VERSION,
        count: 0,
        batchNumber: 0
      }
      const quoteMetadata = {
        quoteId: 'test-quote-id',
        pair: SAMPLE_SUPPORTED_UNIMIND_PAIR,
        referencePrice: '4221.21',
        priceImpact: 0.01, // Valid price impact
        route: SAMPLE_ROUTE,
        blockNumber: 12345,
        usedUnimind: true
      }
      
      const result = calculateParameters(strategy, unimindParameters, quoteMetadata)
      
      // Should compute actual values, not 0,0
      expect(result.pi).toBeCloseTo(0.999764, 5)
      expect(result.tau).toBeCloseTo(15.000235519, 5)
    })

    it('returns classic parameters (0,0) when tradeType is EXACT_OUTPUT', () => {
      const strategy = new PriceImpactStrategy()
      const unimindParameters = {
        pair: SAMPLE_SUPPORTED_UNIMIND_PAIR,
        intrinsicValues: JSON.stringify({
          lambda1: 0,
          lambda2: 8,
          Sigma: Math.log(0.00005)
        }),
        version: UNIMIND_ALGORITHM_VERSION,
        count: 0,
        batchNumber: 0
      }
      const quoteMetadata = {
        quoteId: 'test-quote-id',
        pair: SAMPLE_SUPPORTED_UNIMIND_PAIR,
        referencePrice: '4221.21',
        priceImpact: 0.5, // Valid price impact
        route: SAMPLE_ROUTE,
        blockNumber: 12345,
        usedUnimind: true,
        tradeType: TradeType.EXACT_OUTPUT
      }

      const result = calculateParameters(strategy, unimindParameters, quoteMetadata, mockLog)

      expect(result.pi).toBe(0)
      expect(result.tau).toBe(0)
      expect(result.batchNumber).toBe(0)
      expect(result.algorithmVersion).toBe(UNIMIND_ALGORITHM_VERSION)
      expect(mockLog.info).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'UnimindGuardrailTriggered',
          guardrailType: 'exact_out_not_allowed',
          tradeType: TradeType.EXACT_OUTPUT
        }),
        expect.stringContaining('EXACT_OUTPUT not allowed')
      )
    })

    it('computes normal parameters when tradeType is EXACT_INPUT', () => {
      const strategy = new PriceImpactStrategy()
      const unimindParameters = {
        pair: SAMPLE_SUPPORTED_UNIMIND_PAIR,
        intrinsicValues: JSON.stringify({
          lambda1: 0,
          lambda2: 8,
          Sigma: Math.log(0.00005)
        }),
        version: UNIMIND_ALGORITHM_VERSION,
        count: 0,
        batchNumber: 0
      }
      const quoteMetadata = {
        quoteId: 'test-quote-id',
        pair: SAMPLE_SUPPORTED_UNIMIND_PAIR,
        referencePrice: '4221.21',
        priceImpact: 0.01, // Valid price impact
        route: SAMPLE_ROUTE,
        blockNumber: 12345,
        usedUnimind: true,
        tradeType: TradeType.EXACT_INPUT
      }

      const result = calculateParameters(strategy, unimindParameters, quoteMetadata)

      // Should compute actual values, not 0,0
      expect(result.pi).toBeCloseTo(0.999764, 5)
      expect(result.tau).toBeCloseTo(15.000235519, 5)
    })

    it('computes normal parameters when tradeType is undefined', () => {
      const strategy = new PriceImpactStrategy()
      const unimindParameters = {
        pair: SAMPLE_SUPPORTED_UNIMIND_PAIR,
        intrinsicValues: JSON.stringify({
          lambda1: 0,
          lambda2: 8,
          Sigma: Math.log(0.00005)
        }),
        version: UNIMIND_ALGORITHM_VERSION,
        count: 0,
        batchNumber: 0
      }
      const quoteMetadata = {
        quoteId: 'test-quote-id',
        pair: SAMPLE_SUPPORTED_UNIMIND_PAIR,
        referencePrice: '4221.21',
        priceImpact: 0.01, // Valid price impact
        route: SAMPLE_ROUTE,
        blockNumber: 12345,
        usedUnimind: true
        // tradeType is undefined (not provided)
      }

      const result = calculateParameters(strategy, unimindParameters, quoteMetadata)

      // Should compute actual values, not 0,0
      expect(result.pi).toBeCloseTo(0.999764, 5)
      expect(result.tau).toBeCloseTo(15.000235519, 5)
    })
  })
})