import { Logger } from '@aws-lambda-powertools/logger'
import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn'
import {
  CosignedV2DutchOrder,
  OrderType,
  OrderValidation,
  OrderValidator,
  PermissionedTokenValidator,
} from '@uniswap/uniswapx-sdk'
import { mockClient } from 'aws-sdk-client-mock'
import { BigNumber, Wallet } from 'ethers'
import { mock } from 'jest-mock-extended'
import { ORDER_STATUS, UniswapXOrderEntity } from '../../../../lib/entities'
import { ErrorCode } from '../../../../lib/handlers/base'
import { AVERAGE_BLOCK_TIME } from '../../../../lib/handlers/check-order-status/util'
import { DEFAULT_MAX_OPEN_ORDERS, PRIORITY_ORDER_TARGET_BLOCK_BUFFER } from '../../../../lib/handlers/constants'
import { OnChainValidatorMap } from '../../../../lib/handlers/OnChainValidatorMap'
import { PostOrderHandler } from '../../../../lib/handlers/post-order/handler'
import { getMaxOpenOrders } from '../../../../lib/handlers/post-order/injector'
import { PostOrderBodyParser } from '../../../../lib/handlers/post-order/PostOrderBodyParser'
import { DUTCH_AUCTION_ORDER_ROUTE } from '../../../../lib/handlers/post-order/routes'
import { kickoffOrderTrackingSfn } from '../../../../lib/handlers/shared/sfn'
import { HttpStatusCode } from '../../../../lib/HttpStatusCode'
import { log } from '../../../../lib/Logging'
import { DutchV2Order } from '../../../../lib/models/DutchV2Order'
import { DutchV3Order } from '../../../../lib/models/DutchV3Order'
import { PriorityOrder } from '../../../../lib/models/PriorityOrder'
import { BaseOrdersRepository } from '../../../../lib/repositories/base'
import { UniswapXOrderService } from '../../../../lib/services/UniswapXOrderService'
import { ChainId, SUPPORTED_CHAINS } from '../../../../lib/util/chain'
import { DUTCH_LIMIT } from '../../../../lib/util/order'
import { Permit2Validator } from '../../../../lib/util/Permit2Validator'
import { SDKDutchOrderFactory } from '../../../factories/SDKDutchOrderV1Factory'
import { SDKDutchOrderV2Factory } from '../../../factories/SDKDutchOrderV2Factory'
import { SDKDutchOrderV3Factory } from '../../../factories/SDKDutchOrderV3Factory'
import { SDKPriorityOrderFactory } from '../../../factories/SDKPriorityOrderFactory'
import { cosignOrder, signOrder } from '../../../factories/SignedOrderFactory'
import {
  COSIGNATURE,
  EVENT_CONTEXT,
  MOCK_LATEST_BLOCK,
  MOCK_PROVIDER_MAP,
  QUOTE_ID,
  REQUEST_ID,
  SIGNATURE,
  Tokens,
  ZERO_SIGNATURE,
} from '../../fixtures'
import { PostOrderRequestFactory } from './PostOrderRequestFactory'

jest.mock('@aws-sdk/client-kms')
jest.mock('@uniswap/signer', () => {
  return {
    KmsSigner: jest.fn().mockImplementation(() => {
      return {
        signDigest: jest.fn().mockResolvedValue(COSIGNATURE),
      }
    }),
  }
})

process.env.KMS_KEY_ID = 'test-key-id'
process.env.REGION = 'us-east-2'

// The handler rebuilds these from STATE_MACHINE_NAMES + REGION + ACCOUNT_ID
// (see lib/util/stateMachineArn.ts), so the expected values are full ARNs.
const MOCK_ACCOUNT_ID = '123456789012'
const MOCK_SM_REGION = 'region'
const mockArn = (name: string) => `arn:aws:states:${MOCK_SM_REGION}:${MOCK_ACCOUNT_ID}:stateMachine:${name}`
const MOCK_ARN_1 = mockArn('MOCK_SM_1')
const MOCK_ARN_42161 = mockArn('MOCK_SM_42161')
const MOCK_ARN_11155111 = mockArn('MOCK_SM_11155111')
const MOCK_HASH = '0xhash'
const MOCK_START_EXECUTION_INPUT = JSON.stringify({
  orderHash: MOCK_HASH,
  chainId: 1,
  orderStatus: ORDER_STATUS.OPEN,
})
const mockSfnClient = mockClient(SFNClient)
mockSfnClient
  .on(StartExecutionCommand, {
    stateMachineArn: MOCK_ARN_1,
    name: MOCK_HASH,
    input: MOCK_START_EXECUTION_INPUT,
  })
  .resolves({})

mockSfnClient
  .on(StartExecutionCommand, {
    stateMachineArn: MOCK_ARN_11155111,
    name: MOCK_HASH,
    input: MOCK_START_EXECUTION_INPUT,
  })
  .resolves({})

describe('Testing post order handler.', () => {
  const putOrderAndUpdateNonceTransactionMock = jest.fn()
  const countOrdersByOffererAndStatusMock = jest.fn()
  const validatorMock = jest.fn()
  const onchainValidationSucceededMock = jest.fn().mockResolvedValue(OrderValidation.OK) // Ordervalidation.Ok
  const validationFailedValidatorMock = jest.fn().mockResolvedValue(OrderValidation.ValidationFailed) // OrderValidation.ValidationFailed

  const mockLog = mock<Logger>()
  const requestInjected = {
    requestId: 'testRequest',
    log: mockLog,
  }
  const validatorMockMapping = [
    [
      1,
      {
        validate: onchainValidationSucceededMock,
      },
    ],
    [
      42161,
      {
        validate: onchainValidationSucceededMock,
      },
    ],
    [
      11155111,
      {
        validate: onchainValidationSucceededMock,
      },
    ],
    [
      137,
      {
        validate: validationFailedValidatorMock,
      },
    ],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ] as any

  const injectorPromiseMock: any = {
    getContainerInjected: () => {
      return {}
    },
    getRequestInjected: () => requestInjected,
  }

  const postOrderHandler = new PostOrderHandler(
    'post-order',
    injectorPromiseMock,
    new UniswapXOrderService(
      {
        validate: validatorMock,
      } as any,
      new OnChainValidatorMap<OrderValidator>(validatorMockMapping),
      {
        putOrderAndUpdateNonceTransaction: putOrderAndUpdateNonceTransactionMock,
        countOrdersByOffererAndStatus: countOrdersByOffererAndStatusMock,
      } as any,
      mock<BaseOrdersRepository<UniswapXOrderEntity>>(), //limit repo
      mockLog,
      getMaxOpenOrders,
      {
        logOrderPosted: jest.fn(),
        logCancelled: jest.fn(),
        logInsufficientFunds: jest.fn(),
      },
      MOCK_PROVIDER_MAP
    ),
    new PostOrderBodyParser(mockLog),
    DUTCH_AUCTION_ORDER_ROUTE
  )

  beforeAll(() => {
    process.env['STATE_MACHINE_NAMES'] = JSON.stringify({
      1: 'MOCK_SM_1',
      42161: 'MOCK_SM_42161',
      11155111: 'MOCK_SM_11155111',
    })
    process.env['ACCOUNT_ID'] = MOCK_ACCOUNT_ID
    process.env['REGION'] = MOCK_SM_REGION
    process.env['KMS_KEY_ID'] = 'testtest'
    log.setLogLevel('SILENT')
  })

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockImplementation(() => 100)
  })

  afterEach(() => {
    jest.clearAllMocks()
    mockSfnClient.reset()
  })

  // The generic post-path tests use a Dutch_V2 order: an order type this route accepts.
  const buildV2Order = (
    chainId: number = ChainId.MAINNET,
    overrides: Parameters<typeof SDKDutchOrderV2Factory.buildDutchV2Order>[1] = {}
  ) =>
    new DutchV2Order(
      SDKDutchOrderV2Factory.buildDutchV2Order(chainId, overrides),
      SIGNATURE,
      chainId,
      undefined,
      undefined,
      undefined,
      undefined,
      QUOTE_ID,
      REQUEST_ID
    )

  const postV2Request = (order: DutchV2Order) =>
    PostOrderRequestFactory.request({
      encodedOrder: order.inner.serialize(),
      signature: SIGNATURE,
      chainId: order.chainId,
      quoteId: QUOTE_ID,
      requestId: REQUEST_ID,
      orderType: OrderType.Dutch_V2,
    })

  describe('Testing valid request and response', () => {
    it('Testing valid request and response.', async () => {
      validatorMock.mockReturnValue({ valid: true })

      const order = buildV2Order()
      const expectedOrderEntity = order.toEntity(ORDER_STATUS.OPEN)

      const postOrderResponse = await postOrderHandler.handler(postV2Request(order), EVENT_CONTEXT)

      expect(postOrderResponse.statusCode).toEqual(HttpStatusCode.Created)

      expect(putOrderAndUpdateNonceTransactionMock).toBeCalledWith(expectedOrderEntity)
      expect(onchainValidationSucceededMock).toBeCalled()
      expect(validatorMock).toBeCalledWith(order.inner)
      expect(mockSfnClient.calls()).toHaveLength(1)
      expect(mockSfnClient.call(0).args[0].input).toMatchObject({
        stateMachineArn: MOCK_ARN_1,
        input: JSON.stringify({
          orderHash: expectedOrderEntity.orderHash,
          chainId: 1,
          orderStatus: 'open',
          quoteId: QUOTE_ID,
          orderType: OrderType.Dutch_V2,
          stateMachineArn: MOCK_ARN_1,
          runIndex: 0,
        }),
      })

      expect(postOrderResponse).toEqual({
        body: JSON.stringify({ hash: expectedOrderEntity.orderHash }),
        statusCode: HttpStatusCode.Created,
        headers: {
          'Access-Control-Allow-Credentials': true,
          'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
      })
    })

    it('Testing valid request and response for Dutch_V2', async () => {
      validatorMock.mockReturnValue({ valid: true })

      const order = new DutchV2Order(
        SDKDutchOrderV2Factory.buildDutchV2Order(),
        SIGNATURE,
        1,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        REQUEST_ID
      )
      const expectedOrderEntity = order.toEntity(ORDER_STATUS.OPEN)

      const postOrderResponse = await postOrderHandler.handler(
        PostOrderRequestFactory.request({
          encodedOrder: order.inner.serialize(),
          signature: SIGNATURE,
          orderType: OrderType.Dutch_V2,
        }),
        EVENT_CONTEXT
      )

      expect(postOrderResponse.statusCode).toEqual(HttpStatusCode.Created)

      expect(putOrderAndUpdateNonceTransactionMock).toBeCalledWith(
        expect.objectContaining({
          ...expectedOrderEntity,
          quoteId: expect.any(String),
          requestId: expect.any(String),
        })
      )
      expect(onchainValidationSucceededMock).toBeCalled()
      expect(validatorMock).toBeCalledWith(order.inner)
      expect(mockSfnClient.calls()).toHaveLength(1)
      expect(mockSfnClient.call(0).args[0].input).toMatchObject({
        stateMachineArn: MOCK_ARN_1,
      })

      expect(postOrderResponse).toEqual({
        body: JSON.stringify({ hash: expectedOrderEntity.orderHash }),
        statusCode: HttpStatusCode.Created,
        headers: {
          'Access-Control-Allow-Credentials': true,
          'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
      })
    })

    it('Testing valid request and response for Priority', async () => {
      validatorMock.mockReturnValue({ valid: true })

      const order = new PriorityOrder(
        SDKPriorityOrderFactory.buildPriorityOrder(),
        SIGNATURE,
        1,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        REQUEST_ID
      )

      const postOrderResponse = await postOrderHandler.handler(
        PostOrderRequestFactory.request({
          encodedOrder: order.inner.serialize(),
          signature: SIGNATURE,
          orderType: OrderType.Priority,
        }),
        EVENT_CONTEXT
      )

      // cosignature and cosignerData gets overwritten within the handler
      order.inner.info.cosignature = COSIGNATURE
      order.inner.info.cosignerData = {
        auctionTargetBlock: BigNumber.from(
          MOCK_LATEST_BLOCK + PRIORITY_ORDER_TARGET_BLOCK_BUFFER[order.chainId as ChainId]!
        ), // No extra block since timestamp difference should be 0
      }
      const expectedOrderEntity = order.toEntity(ORDER_STATUS.OPEN)
      expect(postOrderResponse.statusCode).toEqual(HttpStatusCode.Created)

      expect(putOrderAndUpdateNonceTransactionMock).toBeCalledWith(
        expect.objectContaining({
          ...expectedOrderEntity,
          quoteId: expect.any(String),
          requestId: expect.any(String),
          cosignature: COSIGNATURE,
          cosignerData: {
            // MOCK_LATEST_BLOCK + 3
            auctionTargetBlock: MOCK_LATEST_BLOCK + PRIORITY_ORDER_TARGET_BLOCK_BUFFER[order.chainId as ChainId]!,
          },
        })
      )
      expect(onchainValidationSucceededMock).toBeCalled()
      expect(validatorMock).toBeCalledWith(order.inner)
      expect(mockSfnClient.calls()).toHaveLength(1)
      expect(mockSfnClient.call(0).args[0].input).toMatchObject({
        stateMachineArn: MOCK_ARN_1,
      })

      expect(postOrderResponse).toEqual({
        body: JSON.stringify({ hash: expectedOrderEntity.orderHash }),
        statusCode: HttpStatusCode.Created,
        headers: {
          'Access-Control-Allow-Credentials': true,
          'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
      })
    })

    it('should add extra block when timestamp difference is more than 75% of block time', async () => {
      validatorMock.mockReturnValue({ valid: true })

      const order = new PriorityOrder(
        SDKPriorityOrderFactory.buildPriorityOrder(),
        SIGNATURE,
        ChainId.MAINNET,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        REQUEST_ID
      )

      // Mock provider with old timestamp to trigger extra block logic
      const currentTime = Math.floor(Date.now() / 1000)
      const blockTimeSeconds = AVERAGE_BLOCK_TIME(ChainId.MAINNET)
      const oldTimestamp = currentTime - blockTimeSeconds * 0.8 // 80% of block time ago (above 75% threshold)

      // Create a new provider map with the old timestamp
      const mockProviderWithOldTimestamp = {
        getBlockNumber: jest.fn().mockResolvedValue(MOCK_LATEST_BLOCK),
        getBlock: jest.fn().mockResolvedValue({
          number: MOCK_LATEST_BLOCK,
          timestamp: oldTimestamp,
        }),
      }

      const mockProviderMapWithOldTimestamp = new Map([
        [ChainId.MAINNET, mockProviderWithOldTimestamp as any],
        [ChainId.UNICHAIN, mockProviderWithOldTimestamp as any],
        [ChainId.BASE, mockProviderWithOldTimestamp as any],
        [ChainId.POLYGON, mockProviderWithOldTimestamp as any],
      ])

      // Create a new service instance with the modified provider map
      const uniswapXOrderServiceWithOldTimestamp = new UniswapXOrderService(
        {
          validate: validatorMock,
        } as any,
        new OnChainValidatorMap<OrderValidator>(validatorMockMapping),
        {
          putOrderAndUpdateNonceTransaction: putOrderAndUpdateNonceTransactionMock,
          countOrdersByOffererAndStatus: countOrdersByOffererAndStatusMock,
        } as any,
        mock<BaseOrdersRepository<UniswapXOrderEntity>>(), //limit repo
        mockLog,
        getMaxOpenOrders,
        {
          logOrderPosted: jest.fn(),
          logCancelled: jest.fn(),
          logInsufficientFunds: jest.fn(),
        },
        mockProviderMapWithOldTimestamp
      )

      const postOrderHandlerWithOldTimestamp = new PostOrderHandler(
        'post-order',
        injectorPromiseMock,
        uniswapXOrderServiceWithOldTimestamp,
        new PostOrderBodyParser(mockLog),
        DUTCH_AUCTION_ORDER_ROUTE
      )

      const postOrderResponse = await postOrderHandlerWithOldTimestamp.handler(
        PostOrderRequestFactory.request({
          encodedOrder: order.inner.serialize(),
          signature: SIGNATURE,
          orderType: OrderType.Priority,
        }),
        EVENT_CONTEXT
      )

      expect(postOrderResponse.statusCode).toEqual(HttpStatusCode.Created)

      const expectedBuffer = PRIORITY_ORDER_TARGET_BLOCK_BUFFER[ChainId.MAINNET]!
      const expectedTargetBlock = MOCK_LATEST_BLOCK + expectedBuffer + 1 // +1 for extra block

      expect(putOrderAndUpdateNonceTransactionMock).toBeCalledWith(
        expect.objectContaining({
          cosignerData: {
            auctionTargetBlock: expectedTargetBlock,
          },
        })
      )
    })

    it('Testing valid request and response for Dutch_V3', async () => {
      validatorMock.mockReturnValue({ valid: true })

      const order = new DutchV3Order(
        SDKDutchOrderV3Factory.buildDutchV3Order(),
        SIGNATURE,
        ChainId.ARBITRUM_ONE,
        undefined,
        undefined,
        undefined,
        undefined,
        REQUEST_ID
      )
      const expectedOrderEntity = order.toEntity(ORDER_STATUS.OPEN)

      const postOrderResponse = await postOrderHandler.handler(
        PostOrderRequestFactory.request({
          encodedOrder: order.inner.serialize(),
          signature: SIGNATURE,
          orderType: OrderType.Dutch_V3,
          chainId: ChainId.ARBITRUM_ONE,
        }),
        EVENT_CONTEXT
      )
      expect(postOrderResponse.statusCode).toEqual(HttpStatusCode.Created)

      expect(putOrderAndUpdateNonceTransactionMock).toBeCalledWith(
        expect.objectContaining({
          ...expectedOrderEntity,
          quoteId: expect.any(String),
          requestId: REQUEST_ID,
        })
      )
      expect(onchainValidationSucceededMock).toBeCalled()
      expect(validatorMock).toBeCalledWith(order.inner)
      expect(mockSfnClient.calls()).toHaveLength(1)
      expect(mockSfnClient.call(0).args[0].input).toMatchObject({
        stateMachineArn: MOCK_ARN_42161,
      })

      expect(postOrderResponse).toEqual({
        body: JSON.stringify({ hash: expectedOrderEntity.orderHash }),
        statusCode: HttpStatusCode.Created,
        headers: {
          'Access-Control-Allow-Credentials': true,
          'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
      })
    })

    it('Testing valid request and response on another chain', async () => {
      validatorMock.mockReturnValue({ valid: true })

      const order = buildV2Order(ChainId.SEPOLIA)
      const expectedOrderEntity = order.toEntity(ORDER_STATUS.OPEN)

      const postOrderResponse = await postOrderHandler.handler(postV2Request(order), EVENT_CONTEXT)
      expect(postOrderResponse.statusCode).toEqual(HttpStatusCode.Created)

      expect(putOrderAndUpdateNonceTransactionMock).toBeCalledWith(expectedOrderEntity)
      expect(onchainValidationSucceededMock).toBeCalled()
      expect(validatorMock).toBeCalledWith(order.inner)
      expect(mockSfnClient.calls()).toHaveLength(1)
      expect(mockSfnClient.call(0).args[0].input).toMatchObject({
        stateMachineArn: MOCK_ARN_11155111,
      })
      expect(postOrderResponse).toEqual({
        body: JSON.stringify({ hash: expectedOrderEntity.orderHash }),
        statusCode: HttpStatusCode.Created,
        headers: {
          'Access-Control-Allow-Credentials': true,
          'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
      })
    })
  })

  describe('Decaying Dutch V1 orders', () => {
    it.each([[undefined], [OrderType.Dutch]])('rejects one posted with orderType %p', async (orderType) => {
      validatorMock.mockReturnValue({ valid: true })
      const order = SDKDutchOrderFactory.buildDutchOrder()

      const postOrderResponse = await postOrderHandler.handler(
        PostOrderRequestFactory.request({
          encodedOrder: order.serialize(),
          orderType,
        }),
        EVENT_CONTEXT
      )

      expect(postOrderResponse.statusCode).toEqual(HttpStatusCode.BadRequest)
      expect(JSON.parse(postOrderResponse.body)).toMatchObject({
        errorCode: ErrorCode.OrderParseFail,
        detail: 'Unsupported orderType: Dutch',
      })
      expect(validatorMock).not.toHaveBeenCalled()
      expect(putOrderAndUpdateNonceTransactionMock).not.toHaveBeenCalled()
      expect(mockSfnClient.calls()).toHaveLength(0)
    })
  })

  describe('Deprecated DutchLimit orders', () => {
    it('rejects one posted with orderType DutchLimit', async () => {
      validatorMock.mockReturnValue({ valid: true })
      const order = SDKDutchOrderFactory.buildLimitOrder()

      const postOrderResponse = await postOrderHandler.handler(
        PostOrderRequestFactory.request({
          encodedOrder: order.serialize(),
          orderType: DUTCH_LIMIT,
        }),
        EVENT_CONTEXT
      )

      expect(postOrderResponse.statusCode).toEqual(HttpStatusCode.BadRequest)
      expect(JSON.parse(postOrderResponse.body)).toMatchObject({
        errorCode: ErrorCode.OrderParseFail,
        detail: 'Unsupported orderType: DutchLimit',
      })
      expect(validatorMock).not.toHaveBeenCalled()
      expect(putOrderAndUpdateNonceTransactionMock).not.toHaveBeenCalled()
      expect(mockSfnClient.calls()).toHaveLength(0)
    })
  })

  describe('Test order submission blocking', () => {
    describe('Max open orders', () => {
      it('should reject order submission for offerer when too many open orders exist', async () => {
        countOrdersByOffererAndStatusMock.mockReturnValueOnce(DEFAULT_MAX_OPEN_ORDERS + 1)
        validatorMock.mockReturnValue({ valid: true })

        const order = buildV2Order()
        const response = await postOrderHandler.handler(postV2Request(order), EVENT_CONTEXT)
        expect(response.statusCode).toEqual(HttpStatusCode.Forbidden)

        expect(response).toMatchObject({
          body: JSON.stringify({
            errorCode: ErrorCode.TooManyOpenOrders,
            id: 'testRequest',
          }),
          statusCode: HttpStatusCode.Forbidden,
        })
        expect(countOrdersByOffererAndStatusMock).toBeCalled()
        expect(onchainValidationSucceededMock).toBeCalled()
        expect(putOrderAndUpdateNonceTransactionMock).not.toBeCalled()
      })

      it('should allow more orders if in the high list', async () => {
        countOrdersByOffererAndStatusMock.mockReturnValueOnce(100)
        validatorMock.mockReturnValue({ valid: true })

        const order = buildV2Order(ChainId.MAINNET, {
          swapper: '0xa7152fad7467857dc2d4060fecaadf9f6b8227d3',
        })

        const response = await postOrderHandler.handler(postV2Request(order), EVENT_CONTEXT)
        expect(response).toMatchObject({
          statusCode: HttpStatusCode.Created,
        })
        expect(countOrdersByOffererAndStatusMock).toBeCalled()
        expect(onchainValidationSucceededMock).toBeCalled()
        expect(putOrderAndUpdateNonceTransactionMock).toBeCalled()
      })

      it('should reject order submission for offerer in high list at higher order count', async () => {
        countOrdersByOffererAndStatusMock.mockReturnValueOnce(201)
        validatorMock.mockReturnValue({ valid: true })

        const order = buildV2Order(ChainId.MAINNET, {
          swapper: '0xa7152fad7467857dc2d4060fecaadf9f6b8227d3',
        })

        expect(await postOrderHandler.handler(postV2Request(order), EVENT_CONTEXT)).toMatchObject({
          body: JSON.stringify({
            errorCode: ErrorCode.TooManyOpenOrders,
            id: 'testRequest',
          }),
          statusCode: HttpStatusCode.Forbidden,
        })
        expect(countOrdersByOffererAndStatusMock).toBeCalled()
        expect(onchainValidationSucceededMock).toBeCalled()
        expect(putOrderAndUpdateNonceTransactionMock).not.toBeCalled()
      })
    })

    it('should return 500 if DDB call throws', async () => {
      const order = buildV2Order()
      countOrdersByOffererAndStatusMock.mockRejectedValueOnce(new Error('DDB error'))
      expect(await postOrderHandler.handler(postV2Request(order), EVENT_CONTEXT)).toMatchObject({
        statusCode: HttpStatusCode.InternalServerError,
      })
    })

    it('should fail if tokenIn = address(0)', async () => {
      validatorMock.mockReturnValue({ valid: true })
      const order = buildV2Order(ChainId.MAINNET, {
        input: {
          token: '0x0000000000000000000000000000000000000000',
        },
      })
      expect(await postOrderHandler.handler(postV2Request(order), EVENT_CONTEXT)).toMatchObject({
        body: JSON.stringify({
          errorCode: ErrorCode.InvalidTokenInAddress,
          id: 'testRequest',
        }),
        statusCode: HttpStatusCode.BadRequest,
      })
    })
  })

  describe('Testing invalid request validation.', () => {
    it.each([
      [
        { encodedOrder: '0xbad_order' },
        '{"detail":"\\"encodedOrder\\" with value \\"0xbad_order\\" fails to match the required pattern: /^0x[0-9,a-z,A-Z]{0,4000}$/","errorCode":"VALIDATION_ERROR"}',
      ],
      [
        { signature: '0xbad_signature' },
        '{"detail":"\\"signature\\" with value \\"0xbad_signature\\" fails to match the required pattern: /^0x[0-9,a-z,A-Z]{130}$/","errorCode":"VALIDATION_ERROR"}',
      ],
      [
        { chainId: 0 },
        `{"detail":"\\"chainId\\" must be one of [${SUPPORTED_CHAINS.join(', ')}]","errorCode":"VALIDATION_ERROR"}`,
      ],
      [{ quoteId: 'not_UUIDV4' }, '{"detail":"\\"quoteId\\" must be a valid GUID","errorCode":"VALIDATION_ERROR"}'],
    ])('Throws 400 with invalid field %p', async (invalidBodyField, bodyMsg) => {
      const invalidEvent = PostOrderRequestFactory.request({
        ...invalidBodyField,
      })
      const postOrderResponse = await postOrderHandler.handler(invalidEvent, EVENT_CONTEXT)
      expect(postOrderResponse.statusCode).toEqual(400)
      expect(postOrderResponse.body).toEqual(expect.stringContaining(bodyMsg))
      expect(postOrderResponse.body).toEqual(expect.stringContaining('VALIDATION_ERROR'))
      expect(validatorMock).not.toHaveBeenCalled()
      expect(putOrderAndUpdateNonceTransactionMock).not.toHaveBeenCalled()
    })

    it('should call StepFunctions.startExecution method with the correct params', async () => {
      const sfnInput = {
        orderHash: '0xhash',
        chainId: ChainId.MAINNET,
        quoteId: 'quoteId',
        orderStatus: ORDER_STATUS.OPEN,
        orderType: OrderType.Dutch,
        stateMachineArn: MOCK_ARN_1,
        runIndex: 0,
      }
      expect(async () => await kickoffOrderTrackingSfn(sfnInput, MOCK_ARN_1)).not.toThrow()
      expect(mockSfnClient.calls()).toHaveLength(1)

      expect(mockSfnClient.call(0).args[0].input).toStrictEqual(
        new StartExecutionCommand({
          stateMachineArn: MOCK_ARN_1,
          input: JSON.stringify(sfnInput),
          name: expect.any(String),
        }).input
      )
    })
  })

  describe('Testing invalid response validation.', () => {
    it('Throws 500 when db interface errors out.', async () => {
      putOrderAndUpdateNonceTransactionMock.mockImplementation(() => {
        throw new Error('database unavailable')
      })

      validatorMock.mockReturnValue({ valid: true })

      const order = buildV2Order()
      const expectedOrderEntity = order.toEntity(ORDER_STATUS.OPEN)
      const postOrderResponse = await postOrderHandler.handler(postV2Request(order), EVENT_CONTEXT)
      expect(putOrderAndUpdateNonceTransactionMock).toBeCalledWith(expectedOrderEntity)
      expect(postOrderResponse).toEqual({
        body: JSON.stringify({ detail: 'database unavailable', errorCode: ErrorCode.InternalError, id: 'testRequest' }),
        statusCode: HttpStatusCode.InternalServerError,
        headers: {
          'Access-Control-Allow-Credentials': true,
          'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
      })
    })
  })

  describe('Testing posts to the wrong route', () => {
    it.each([undefined, OrderType.Limit])(
      'rejects a limit order (orderType %s) and points to the limit order route',
      async (orderType) => {
        const order = SDKDutchOrderFactory.buildLimitOrder()
        const postOrderResponse = await postOrderHandler.handler(
          PostOrderRequestFactory.request({
            encodedOrder: order.serialize(),
            orderType,
          }),
          EVENT_CONTEXT
        )

        expect(postOrderResponse.statusCode).toEqual(HttpStatusCode.BadRequest)
        expect(JSON.parse(postOrderResponse.body)).toEqual({
          detail: 'Limit orders must be posted to /v2/limit-order',
          errorCode: ErrorCode.InvalidOrder,
          id: 'testRequest',
        })
        expect(validatorMock).not.toHaveBeenCalled()
        expect(putOrderAndUpdateNonceTransactionMock).not.toHaveBeenCalled()
        expect(mockSfnClient.calls()).toHaveLength(0)
      }
    )
  })

  describe('When validation fails', () => {
    it('off-chain validation failed; throws 400', async () => {
      const errorCode = ErrorCode.InvalidOrder
      const errorString = 'testing offchain validation'
      validatorMock.mockReturnValue({
        valid: false,
        errorString,
      })
      const order = buildV2Order()
      const postOrderResponse = await postOrderHandler.handler(postV2Request(order), EVENT_CONTEXT)
      expect(putOrderAndUpdateNonceTransactionMock).not.toHaveBeenCalled()
      expect(postOrderResponse).toEqual({
        body: JSON.stringify({ detail: errorString, errorCode, id: 'testRequest' }),
        statusCode: HttpStatusCode.BadRequest,
        headers: {
          'Access-Control-Allow-Credentials': true,
          'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
      })
    })

    it('on-chain validation failed; throws 400', async () => {
      const order = buildV2Order()
      validatorMock.mockReturnValue({
        valid: true,
      })
      onchainValidationSucceededMock.mockResolvedValueOnce(OrderValidation.ValidationFailed)
      const postOrderResponse = await postOrderHandler.handler(postV2Request(order), EVENT_CONTEXT)
      expect(putOrderAndUpdateNonceTransactionMock).not.toHaveBeenCalled()
      expect(postOrderResponse).toEqual({
        body: JSON.stringify({
          detail: `Onchain validation failed: ValidationFailed`,
          errorCode: ErrorCode.InvalidOrder,
          id: 'testRequest',
        }),
        statusCode: HttpStatusCode.BadRequest,
        headers: {
          'Access-Control-Allow-Credentials': true,
          'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
      })
    })
  })

  describe('Permissioned input token (BUIDL) orders', () => {
    // The order quoter is bypassed for these, so the post path itself has to authenticate the
    // order. The token's transfer check is isolated as passing for an eligible swapper/filler
    // pair; everything from the request body to the write call is the real code.
    const swapper = Wallet.createRandom()
    const cosigner = Wallet.createRandom()

    let preTransferCheck: jest.SpyInstance
    let permit2Validate: jest.SpyInstance
    let order: CosignedV2DutchOrder
    let signature: string

    const buildPermissionedOrder = (swapperAddress: string) =>
      SDKDutchOrderV2Factory.buildDutchV2Order(ChainId.MAINNET, {
        swapper: swapperAddress,
        cosigner: cosigner.address,
        input: { token: Tokens.MAINNET.BUIDL, startAmount: '1000000', endAmount: '1000000' },
      })

    const post = (encodedOrder: string, postedSignature: string) =>
      postOrderHandler.handler(
        PostOrderRequestFactory.request({ encodedOrder, signature: postedSignature, orderType: OrderType.Dutch_V2 }),
        EVENT_CONTEXT
      )

    beforeAll(async () => {
      order = await cosignOrder(buildPermissionedOrder(swapper.address), cosigner)
      signature = await signOrder(order, swapper)
    })

    beforeEach(() => {
      validatorMock.mockReturnValue({ valid: true })
      // an earlier suite leaves the write mock throwing; clearAllMocks keeps implementations
      putOrderAndUpdateNonceTransactionMock.mockResolvedValue(undefined)
      preTransferCheck = jest.spyOn(PermissionedTokenValidator, 'preTransferCheck').mockResolvedValue(true)
      permit2Validate = jest.spyOn(Permit2Validator.prototype, 'validate').mockResolvedValue(OrderValidation.OK)
    })

    afterEach(() => {
      preTransferCheck.mockRestore()
      permit2Validate.mockRestore()
    })

    it('accepts the order with its swapper signature and cosignature, without the order quoter', async () => {
      const response = await post(order.serialize(), signature)

      expect(response.statusCode).toEqual(HttpStatusCode.Created)
      expect(putOrderAndUpdateNonceTransactionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          orderHash: order.hash().toLowerCase(),
          signature,
          offerer: swapper.address.toLowerCase(),
        })
      )
      expect(onchainValidationSucceededMock).not.toHaveBeenCalled()
    })

    it('rejects the same order bytes with a zeroed signature, so a stored order cannot be overwritten', async () => {
      const response = await post(order.serialize(), ZERO_SIGNATURE)

      expect(response).toMatchObject({
        statusCode: HttpStatusCode.BadRequest,
        body: JSON.stringify({
          detail: 'Signature validation failed: InvalidSignature',
          errorCode: ErrorCode.InvalidOrder,
          id: 'testRequest',
        }),
      })
      // the write is one transaction with the swapper's nonce update, so neither happens
      expect(putOrderAndUpdateNonceTransactionMock).not.toHaveBeenCalled()
      expect(preTransferCheck).not.toHaveBeenCalled()
    })

    it("rejects an order fabricated under another wallet's address with an empty cosignature", async () => {
      const victim = Wallet.createRandom()
      const response = await post(buildPermissionedOrder(victim.address).serialize(), ZERO_SIGNATURE)

      expect(response).toMatchObject({
        statusCode: HttpStatusCode.BadRequest,
        body: JSON.stringify({
          detail: 'Signature validation failed: InvalidCosignature',
          errorCode: ErrorCode.InvalidOrder,
          id: 'testRequest',
        }),
      })
      expect(putOrderAndUpdateNonceTransactionMock).not.toHaveBeenCalled()
      expect(countOrdersByOffererAndStatusMock).toHaveBeenCalledWith(victim.address.toLowerCase(), ORDER_STATUS.OPEN)
    })
  })
})
