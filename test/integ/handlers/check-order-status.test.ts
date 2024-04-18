import { DutchInput, DutchOutput, OrderType, OrderValidation, TokenTransfer } from '@uniswap/uniswapx-sdk'
import { DocumentClient } from 'aws-sdk/clients/dynamodb'
import { BigNumber } from 'ethers'
import { mock } from 'jest-mock-extended'
import { ORDER_STATUS } from '../../../lib/entities'
import { FillEventLogger } from '../../../lib/handlers/check-order-status/fill-event-logger'
import { CheckOrderStatusHandler } from '../../../lib/handlers/check-order-status/handler'
import { CheckOrderStatusService, CheckOrderStatusUtils } from '../../../lib/handlers/check-order-status/service'
import {
  calculateDutchRetryWaitSeconds,
  FILL_EVENT_LOOKBACK_BLOCKS_ON,
  getSettledAmounts,
} from '../../../lib/handlers/check-order-status/util'
import { log } from '../../../lib/Logging'
import { DutchOrdersRepository } from '../../../lib/repositories/dutch-orders-repository'
import { LimitOrdersRepository } from '../../../lib/repositories/limit-orders-repository'
import { AnalyticsService } from '../../../lib/services/analytics-service'
import { RelayOrderService } from '../../../lib/services/RelayOrderService'
import { NATIVE_ADDRESS } from '../../../lib/util/constants'
import { MOCK_ORDER_ENTITY, MOCK_ORDER_HASH } from '../../test-data'
import { ORDER_INFO } from '../../unit/fixtures'

describe('Testing check order status handler', () => {
  const mockedBlockNumber = 123
  const validateMock = jest.fn()
  const getFillEventsMock = jest.fn()
  const getFillInfoMock = jest.fn()

  const getByHashMock = jest.fn().mockReturnValue(MOCK_ORDER_ENTITY)
  const updateOrderStatusMock = jest.fn().mockReturnValue(Promise<void>)
  const providerMock = jest.fn().mockReturnValue(mockedBlockNumber)
  const getTransactionMock = jest.fn()

  const dynamoConfig = {
    convertEmptyValues: true,
    endpoint: 'localhost:8000',
    region: 'local-env',
    sslEnabled: false,
    credentials: {
      accessKeyId: 'fakeMyKeyId',
      secretAccessKey: 'fakeSecretAccessKey',
    },
  }

  const localDocumentClient = new DocumentClient(dynamoConfig)
  const mockLookbackFn = () => 10

  beforeAll(() => {
    log.setLogLevel('SILENT')
  })

  const buildInjectorPromiseMock = (retryCount: number, orderStatus: string) => {
    return {
      getContainerInjected: () => {
        return {
          dbInterface: {
            getByHash: getByHashMock,
            updateOrderStatus: updateOrderStatusMock,
          },
        }
      },
      getRequestInjected: () => {
        return {
          chainId: 1,
          orderHash: MOCK_ORDER_HASH,
          retryCount: retryCount,
          orderStatus: orderStatus,
          log,
          orderType: OrderType.Dutch,
          orderQuoter: {
            validate: validateMock,
          },
          orderWatcher: {
            getFillEvents: getFillEventsMock,
            getFillInfo: getFillInfoMock,
          },
          provider: {
            getBlockNumber: providerMock,
            getTransaction: getTransactionMock,
            getBlock: () =>
              Promise.resolve({
                timestamp: 123456,
              }),
          },
        }
      },
    }
  }

  describe('Test invalid input fields', () => {
    const injectorPromiseMock: any = buildInjectorPromiseMock(0, ORDER_STATUS.OPEN)
    const checkOrderStatusHandler = new CheckOrderStatusHandler(
      'check-order-status',
      injectorPromiseMock,
      new CheckOrderStatusService(
        DutchOrdersRepository.create(localDocumentClient),
        mockLookbackFn,
        mock<FillEventLogger>(),
        mock<CheckOrderStatusUtils>()
      ),
      new CheckOrderStatusService(
        LimitOrdersRepository.create(localDocumentClient),
        mockLookbackFn,
        mock<FillEventLogger>(),
        mock<CheckOrderStatusUtils>()
      ),
      mock<RelayOrderService>()
    )

    it('Should throw when orderHash is not provided', async () => {
      await expect(checkOrderStatusHandler.handler({} as any)).rejects.toThrowError('"orderHash" is required')
    })

    it('should throw when orderHash is not valid', async () => {
      await expect(checkOrderStatusHandler.handler({ orderHash: '123' } as any)).rejects.toThrowError(
        '"orderHash" with value "123" fails to match the required pattern: /^0x[0-9,a-z,A-Z]{64}$/'
      )
    })

    it('should throw if orderStatus is not provided', async () => {
      await expect(
        checkOrderStatusHandler.handler({ orderHash: MOCK_ORDER_HASH, chainId: 1 } as any)
      ).rejects.toThrowError('"orderStatus" is required')
    })

    it('should throw if orderStatus is not valid', async () => {
      await expect(
        checkOrderStatusHandler.handler({ orderHash: MOCK_ORDER_HASH, chainId: 1, orderStatus: 'foo' } as any)
      ).rejects.toThrowError(
        '"orderStatus" must be one of [open, filled, cancelled, expired, error, insufficient-funds]'
      )
    })

    it('should throw if chainId is not provided', async () => {
      await expect(
        checkOrderStatusHandler.handler({ orderHash: MOCK_ORDER_HASH, orderStatus: ORDER_STATUS.OPEN as string } as any)
      ).rejects.toThrowError('"chainId" is required')
    })

    it('should throw if chainId is not supported', async () => {
      await expect(
        checkOrderStatusHandler.handler({
          orderHash: MOCK_ORDER_HASH,
          orderStatus: ORDER_STATUS.OPEN as string,
          chainId: 2022,
        } as any)
      ).rejects.toThrowError(`"chainId" must be one of [1, 137, 11155111, 5]`)
    })
  })

  describe('Test valid order', () => {
    const initialInjectorPromiseMock: any = buildInjectorPromiseMock(0, ORDER_STATUS.OPEN)
    const handlerEventMock = {
      orderHash: MOCK_ORDER_HASH,
      orderStatus: ORDER_STATUS.OPEN as string,
      chainId: 1,
      orderType: OrderType.Dutch,
    }

    beforeAll(async () => {
      await DutchOrdersRepository.create(localDocumentClient).putOrderAndUpdateNonceTransaction(MOCK_ORDER_ENTITY)
    })

    beforeEach(async () => {
      jest.clearAllMocks()
    })

    it('should return expired order status', async () => {
      const dutchOrdersRepository = DutchOrdersRepository.create(localDocumentClient)
      const limitOrdersRepository = LimitOrdersRepository.create(localDocumentClient)
      const checkOrderStatusHandler = new CheckOrderStatusHandler(
        'check-order-status',
        initialInjectorPromiseMock,
        new CheckOrderStatusService(
          dutchOrdersRepository,
          mockLookbackFn,
          mock<FillEventLogger>(),
          new CheckOrderStatusUtils(
            OrderType.Dutch,
            mock<AnalyticsService>(),
            dutchOrdersRepository,
            calculateDutchRetryWaitSeconds
          )
        ),
        new CheckOrderStatusService(
          limitOrdersRepository,
          mockLookbackFn,
          mock<FillEventLogger>(),
          new CheckOrderStatusUtils(OrderType.Limit, mock<AnalyticsService>(), limitOrdersRepository, () => 30)
        ),
        mock<RelayOrderService>()
      )
      validateMock.mockReturnValue(OrderValidation.Expired)
      getFillInfoMock.mockReturnValue([])
      expect(await checkOrderStatusHandler.handler(handlerEventMock)).toMatchObject({
        orderStatus: ORDER_STATUS.EXPIRED,
      })
    })

    it('should check fill events when order expired', async () => {
      const dutchOrdersRepository = DutchOrdersRepository.create(localDocumentClient)
      const limitOrdersRepository = LimitOrdersRepository.create(localDocumentClient)
      const checkOrderStatusHandler = new CheckOrderStatusHandler(
        'check-order-status',
        initialInjectorPromiseMock,
        new CheckOrderStatusService(
          dutchOrdersRepository,
          mockLookbackFn,
          mock<FillEventLogger>(),
          new CheckOrderStatusUtils(
            OrderType.Dutch,
            mock<AnalyticsService>(),
            dutchOrdersRepository,
            calculateDutchRetryWaitSeconds
          )
        ),
        new CheckOrderStatusService(
          limitOrdersRepository,
          mockLookbackFn,
          mock<FillEventLogger>(),
          new CheckOrderStatusUtils(OrderType.Limit, mock<AnalyticsService>(), limitOrdersRepository, () => 30)
        ),
        mock<RelayOrderService>()
      )
      validateMock.mockReturnValue(OrderValidation.Expired)
      getTransactionMock.mockReturnValueOnce({
        wait: () =>
          Promise.resolve({
            effectiveGasPrice: BigNumber.from(1),
            gasUsed: 100,
          }),
      })
      getFillInfoMock.mockReturnValue([
        {
          orderHash: MOCK_ORDER_HASH,
          filler: '0x123',
          nonce: BigNumber.from(1),
          swapper: '0x123',
          blockNumber: 12321312313,
          txHash: '0x1244345323',
          inputs: [{ token: 'USDC', amount: BigNumber.from(100) }],
          outputs: [{ token: 'WETH', amount: BigNumber.from(1) }],
        },
      ])

      expect(await checkOrderStatusHandler.handler(handlerEventMock)).toMatchObject({
        orderStatus: ORDER_STATUS.FILLED,
      })
      expect(getFillInfoMock).toBeCalled()
    })

    it('should check fill events when nonceUsed', async () => {
      const dutchOrdersRepository = DutchOrdersRepository.create(localDocumentClient)
      const limitOrdersRepository = LimitOrdersRepository.create(localDocumentClient)
      const checkOrderStatusHandler = new CheckOrderStatusHandler(
        'check-order-status',
        initialInjectorPromiseMock,
        new CheckOrderStatusService(
          dutchOrdersRepository,
          mockLookbackFn,
          mock<FillEventLogger>(),
          new CheckOrderStatusUtils(
            OrderType.Dutch,
            mock<AnalyticsService>(),
            dutchOrdersRepository,
            calculateDutchRetryWaitSeconds
          )
        ),
        new CheckOrderStatusService(
          limitOrdersRepository,
          mockLookbackFn,
          mock<FillEventLogger>(),
          new CheckOrderStatusUtils(OrderType.Limit, mock<AnalyticsService>(), limitOrdersRepository, () => 30)
        ),
        mock<RelayOrderService>()
      )
      validateMock.mockReturnValue(OrderValidation.NonceUsed)
      getTransactionMock.mockReturnValueOnce({
        wait: () =>
          Promise.resolve({
            effectiveGasPrice: BigNumber.from(1),
            gasUsed: 100,
          }),
      })
      getFillInfoMock.mockReturnValue([
        {
          orderHash: MOCK_ORDER_HASH,
          filler: '0x123',
          nonce: BigNumber.from(1),
          swapper: '0x123',
          blockNumber: 12321312313,
          txHash: '0x1244345323',
          inputs: [{ token: 'USDC', amount: BigNumber.from(100) }],
          outputs: [{ token: 'WETH', amount: BigNumber.from(1) }],
        },
      ])

      expect(await checkOrderStatusHandler.handler(handlerEventMock)).toMatchObject({
        orderStatus: ORDER_STATUS.FILLED,
      })
    })

    it('should return insufficient-funds order status', async () => {
      const dutchOrdersRepository = DutchOrdersRepository.create(localDocumentClient)
      const limitOrdersRepository = LimitOrdersRepository.create(localDocumentClient)
      const checkOrderStatusHandler = new CheckOrderStatusHandler(
        'check-order-status',
        initialInjectorPromiseMock,
        new CheckOrderStatusService(
          dutchOrdersRepository,
          mockLookbackFn,
          mock<FillEventLogger>(),
          new CheckOrderStatusUtils(
            OrderType.Dutch,
            mock<AnalyticsService>(),
            dutchOrdersRepository,
            calculateDutchRetryWaitSeconds
          )
        ),
        new CheckOrderStatusService(
          limitOrdersRepository,
          mockLookbackFn,
          mock<FillEventLogger>(),
          new CheckOrderStatusUtils(OrderType.Limit, mock<AnalyticsService>(), limitOrdersRepository, () => 30)
        ),
        mock<RelayOrderService>()
      )
      validateMock.mockReturnValue(OrderValidation.InsufficientFunds)
      expect(await checkOrderStatusHandler.handler(handlerEventMock)).toMatchObject({
        orderStatus: ORDER_STATUS.INSUFFICIENT_FUNDS,
      })
    })

    it('should return error order status', async () => {
      const dutchOrdersRepository = DutchOrdersRepository.create(localDocumentClient)
      const limitOrdersRepository = LimitOrdersRepository.create(localDocumentClient)
      const checkOrderStatusHandler = new CheckOrderStatusHandler(
        'check-order-status',
        initialInjectorPromiseMock,
        new CheckOrderStatusService(
          dutchOrdersRepository,
          mockLookbackFn,
          mock<FillEventLogger>(),
          new CheckOrderStatusUtils(
            OrderType.Dutch,
            mock<AnalyticsService>(),
            dutchOrdersRepository,
            calculateDutchRetryWaitSeconds
          )
        ),
        new CheckOrderStatusService(
          limitOrdersRepository,
          mockLookbackFn,
          mock<FillEventLogger>(),
          new CheckOrderStatusUtils(OrderType.Limit, mock<AnalyticsService>(), limitOrdersRepository, () => 30)
        ),
        mock<RelayOrderService>()
      )
      validateMock
        .mockReturnValueOnce(OrderValidation.UnknownError)
        .mockReturnValueOnce(OrderValidation.InvalidSignature)
        .mockReturnValueOnce(OrderValidation.InvalidOrderFields)

      for (let i = 0; i < 3; i++) {
        expect(await checkOrderStatusHandler.handler(handlerEventMock)).toMatchObject({
          orderStatus: ORDER_STATUS.ERROR,
        })
      }
    })

    it('return latest on-chain status and increment retry count', async () => {
      const dutchOrdersRepository = DutchOrdersRepository.create(localDocumentClient)
      const limitOrdersRepository = LimitOrdersRepository.create(localDocumentClient)
      const checkOrderStatusHandler = new CheckOrderStatusHandler(
        'check-order-status',
        initialInjectorPromiseMock,
        new CheckOrderStatusService(
          dutchOrdersRepository,
          mockLookbackFn,
          mock<FillEventLogger>(),
          new CheckOrderStatusUtils(
            OrderType.Dutch,
            mock<AnalyticsService>(),
            dutchOrdersRepository,
            calculateDutchRetryWaitSeconds
          )
        ),
        new CheckOrderStatusService(
          limitOrdersRepository,
          mockLookbackFn,
          mock<FillEventLogger>(),
          new CheckOrderStatusUtils(OrderType.Limit, mock<AnalyticsService>(), limitOrdersRepository, () => 30)
        ),
        mock<RelayOrderService>()
      )

      validateMock.mockReturnValue(OrderValidation.OK)
      const response = await checkOrderStatusHandler.handler(handlerEventMock)

      expect(response).toEqual({
        orderHash: MOCK_ORDER_HASH,
        orderStatus: 'open',
        retryCount: 1,
        retryWaitSeconds: 12,
        chainId: 1,
        startingBlockNumber: mockedBlockNumber - FILL_EVENT_LOOKBACK_BLOCKS_ON(1),
        orderType: OrderType.Dutch,
      })
    })
  })

  describe('Test getSettledAmounts', () => {
    const getMockFillInfo = (inputs: TokenTransfer[], outputs: TokenTransfer[]) => ({
      blockNumber: 1,
      txHash: '0x456',
      inputs,
      outputs,
      orderHash: '0x123',
      filler: '0x123',
      nonce: BigNumber.from(1),
      swapper: '0x123',
    })

    const getMockDutchOrder = (input: DutchInput, outputs: DutchOutput[], resolvedOutput?: TokenTransfer): any => ({
      info: { ...ORDER_INFO, input, outputs },
      resolve: () => {
        return {
          input: { token: input.token, amount: input.startAmount },
          outputs: [resolvedOutput ?? { token: outputs[0].token, amount: outputs[0].endAmount }],
        }
      },
    })

    it('exact input', () => {
      const resolvedInput = {
        token: 'weth',
        amount: BigNumber.from(1),
      } as TokenTransfer
      const resolvedOutput = {
        token: 'usdc',
        amount: BigNumber.from(90),
      } as TokenTransfer

      const mockFillInfo = getMockFillInfo([resolvedInput], [resolvedOutput])
      const mockDutchOrder = getMockDutchOrder(
        { token: resolvedInput.token, startAmount: resolvedInput.amount, endAmount: resolvedInput.amount },
        [
          {
            token: resolvedOutput.token,
            startAmount: BigNumber.from(100),
            endAmount: resolvedOutput.amount,
            recipient: '0x123',
          },
        ]
      )

      const settledAmounts = getSettledAmounts(mockFillInfo, 100, mockDutchOrder)
      expect(settledAmounts).toEqual([
        {
          tokenIn: resolvedInput.token,
          amountIn: resolvedInput.amount.toString(),
          tokenOut: resolvedOutput.token,
          amountOut: resolvedOutput.amount.toString(),
        },
      ])
    })

    it('exact output', () => {
      const resolvedInput = {
        token: 'weth',
        amount: BigNumber.from(1),
      } as TokenTransfer
      const resolvedOutput = {
        token: 'usdc',
        amount: BigNumber.from(90),
      } as TokenTransfer

      const mockFillInfo = getMockFillInfo([resolvedInput], [resolvedOutput])
      const mockDutchOrder = getMockDutchOrder(
        { token: resolvedInput.token, startAmount: BigNumber.from(2), endAmount: resolvedInput.amount },
        [
          {
            token: resolvedOutput.token,
            startAmount: resolvedOutput.amount,
            endAmount: resolvedOutput.amount,
            recipient: '0x123',
          },
        ]
      )

      const settledAmounts = getSettledAmounts(mockFillInfo, 100, mockDutchOrder)
      expect(settledAmounts).toEqual([
        {
          tokenIn: resolvedInput.token,
          amountIn: resolvedInput.amount.toString(),
          tokenOut: resolvedOutput.token,
          amountOut: resolvedOutput.amount.toString(),
        },
      ])
    })

    it('exact input ETH out', () => {
      const resolvedInput = {
        token: 'usdc',
        amount: BigNumber.from(100),
      } as TokenTransfer
      const resolvedOutput = {
        token: NATIVE_ADDRESS,
        amount: BigNumber.from(1),
      } as TokenTransfer

      const mockFillInfo = getMockFillInfo([resolvedInput], [])
      const mockDutchOrder = getMockDutchOrder(
        { token: resolvedInput.token, startAmount: resolvedInput.amount, endAmount: resolvedInput.amount },
        [
          {
            token: resolvedOutput.token,
            startAmount: BigNumber.from(2),
            endAmount: resolvedOutput.amount,
            recipient: '0x123',
          },
        ],
        { token: resolvedOutput.token, amount: resolvedOutput.amount }
      )

      const settledAmounts = getSettledAmounts(mockFillInfo, 100, mockDutchOrder)
      expect(settledAmounts).toEqual([
        {
          tokenIn: resolvedInput.token,
          amountIn: resolvedInput.amount.toString(),
          tokenOut: resolvedOutput.token,
          amountOut: resolvedOutput.amount.toString(),
        },
      ])
    })

    it('exact output ETH out', () => {
      const resolvedInput = {
        token: 'usdc',
        amount: BigNumber.from(100),
      } as TokenTransfer
      const resolvedOutput = {
        token: NATIVE_ADDRESS,
        amount: BigNumber.from(1),
      } as TokenTransfer

      const mockFillInfo = getMockFillInfo([resolvedInput], [])
      const mockDutchOrder = getMockDutchOrder(
        { token: resolvedInput.token, startAmount: BigNumber.from(200), endAmount: resolvedInput.amount },
        [
          {
            token: resolvedOutput.token,
            startAmount: resolvedOutput.amount,
            endAmount: resolvedOutput.amount,
            recipient: '0x123',
          },
        ],
        { token: resolvedOutput.token, amount: resolvedOutput.amount }
      )

      const settledAmounts = getSettledAmounts(mockFillInfo, 100, mockDutchOrder)
      expect(settledAmounts).toEqual([
        {
          tokenIn: resolvedInput.token,
          amountIn: resolvedInput.amount.toString(),
          tokenOut: resolvedOutput.token,
          amountOut: resolvedOutput.amount.toString(),
        },
      ])
    })
  })
})
