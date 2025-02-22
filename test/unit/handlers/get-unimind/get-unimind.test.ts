import { Logger } from '@aws-lambda-powertools/logger'
import { mock } from 'jest-mock-extended'
import { EVENT_CONTEXT } from '../../fixtures'
import { artemisModifyCalldata, GetUnimindHandler } from '../../../../lib/handlers/get-unimind/handler'
import { QuoteMetadataRepository } from '../../../../lib/repositories/quote-metadata-repository'
import { UnimindParametersRepository } from '../../../../lib/repositories/unimind-parameters-repository'
import { ErrorCode } from '../../../../lib/handlers/base'
import { UNIMIND_DEV_SWAPPER_ADDRESS } from '../../../../lib/util/constants'
import { EXECUTOR_ADDRESS } from '../../../../lib/handlers/constants'
import { CommandParser, CommandType } from '@uniswap/universal-router-sdk'
import { Interface } from 'ethers/lib/utils'

const SAMPLE_ROUTE = {
  quote: "1234",
  quoteGasAdjusted: "5678",
  gasPriceWei: "1234",
  gasUseEstimateQuote: "2345",
  gasUseEstimate: "3456",
  methodParameters: {
    calldata: "0x3593564c000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000067b7da1b00000000000000000000000000000000000000000000000000000000000000030006040000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000300000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000000000180000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000517da02c00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000002b2a06a17cbc6d0032cac2c6696da90f29d39a1a29002710833589fcd6edb6e08f4c7c32d4f71b54bda029130000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000060000000000000000000000000833589fcd6edb6e08f4c7c32d4f71b54bda029130000000000000000000000007ffc3dbf3b2b50ff3a1d5523bc24bb5043837b1400000000000000000000000000000000000000000000000000000000000000190000000000000000000000000000000000000000000000000000000000000060000000000000000000000000833589fcd6edb6e08f4c7c32d4f71b54bda02913000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000133356f6",
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
    const quoteQueryParams = {
      ...quoteMetadata,
      swapper: UNIMIND_DEV_SWAPPER_ADDRESS
    }

    mockUnimindParametersRepo.getByPair.mockResolvedValue({
      pair: 'ETH-USDC',
      pi: 3.14,
      tau: 4.2
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

  it('Returns default parameters when unimind parameters not found', async () => {
    const quoteMetadata = {
      quoteId: 'test-quote-id',
      referencePrice: '4221.21',
      priceImpact: 0.01,
      pair: 'ALAN-LEN',
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
      route: JSON.parse(quoteMetadata.route)
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body).toEqual({
      pi: expect.any(Number),
      tau: expect.any(Number)
    })
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
      tau: 0
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
      pair: 'ETH-USDC',
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
      pair: 'ETH-USDC',
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
})

describe('Correctly modify URA calldata for Artemis support', () => {
  const mockLog = mock<Logger>()
  it('artemisModifyCalldata for execute + deadline', () => {
    const calldata = "0x3593564c000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000067b8fcaa0000000000000000000000000000000000000000000000000000000000000003000604000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000030000000000000000000000000000000000000000000000000000000000000060000000000000000000000000000000000000000000000000000000000000018000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000eedd0333ad7e3f2e6000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000002b0b3e328455c4059eeb9e3f84b5543f74e24e7e1b0001f44200000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000006000000000000000000000000042000000000000000000000000000000000000060000000000000000000000005d64d14d2cf4fe5fe4e65b1c7e3d11e18d493091000000000000000000000000000000000000000000000000000000000000001900000000000000000000000000000000000000000000000000000000000000600000000000000000000000004200000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000001a6514a8546b1ab"
    const decoded = CommandParser.parseCalldata(calldata)
    const swapCommand = decoded.commands[0]

    const modifiedCalldata = artemisModifyCalldata(calldata, mockLog)
    const modifiedDecoded = CommandParser.parseCalldata(modifiedCalldata)
    const modifiedSwapCommand = modifiedDecoded.commands[0]
    expect(modifiedSwapCommand).toEqual(swapCommand)
    // Expect Portion to be removed
    expect(modifiedDecoded.commands.find(command => command.commandType === CommandType.PAY_PORTION)).toBeUndefined()
    const sweepInput = modifiedDecoded.commands.find(command => command.commandType === CommandType.SWEEP)
    expect(sweepInput).toBeDefined()
    // Check that the SWEEP recipient is the executor address
    expect(sweepInput?.params.find(param => param.name === 'recipient')?.value).toEqual(EXECUTOR_ADDRESS)
    // Check that the new deadline is in the future
    const iface = new Interface(["function execute(bytes commands, bytes[] inputs, uint256 deadline)"])
    const [, , deadline] = iface.decodeFunctionData('execute', modifiedCalldata)
    expect(deadline.toNumber()).toBeGreaterThan(Date.now() / 1000)
  })

  it('artemisModifyCalldata for execute without deadline', () => {
    const calldata = "0x24856bc3000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000003000604000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000030000000000000000000000000000000000000000000000000000000000000060000000000000000000000000000000000000000000000000000000000000018000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000eedd0333ad7e3f2e6000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000002b0b3e328455c4059eeb9e3f84b5543f74e24e7e1b0001f44200000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000006000000000000000000000000042000000000000000000000000000000000000060000000000000000000000005d64d14d2cf4fe5fe4e65b1c7e3d11e18d493091000000000000000000000000000000000000000000000000000000000000001900000000000000000000000000000000000000000000000000000000000000600000000000000000000000004200000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000001ba3fb1567e93fe"
    const decoded = CommandParser.parseCalldata(calldata)
    const swapCommand = decoded.commands[0]

    const modifiedCalldata = artemisModifyCalldata(calldata, mockLog)
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
})
