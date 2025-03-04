import { OrderType, OrderValidation } from '@uniswap/uniswapx-sdk'
import { BigNumber } from 'ethers'
import { mock } from 'jest-mock-extended'
import { ORDER_STATUS } from '../../../lib/entities'
import { FillEventLogger } from '../../../lib/handlers/check-order-status/fill-event-logger'
import {
  CheckOrderStatusRequest,
  CheckOrderStatusService,
  CheckOrderStatusUtils,
} from '../../../lib/handlers/check-order-status/service'
import {
  calculateDutchRetryWaitSeconds,
  FILL_EVENT_LOOKBACK_BLOCKS_ON,
} from '../../../lib/handlers/check-order-status/util'
import { log } from '../../../lib/Logging'
import { MOCK_ORDER_ENTITY, MOCK_ORDER_HASH, MOCK_V2_ORDER_ENTITY } from '../../test-data'

jest.mock('../../../lib/handlers/check-order-status/util', () => {
  const original = jest.requireActual('../../../lib/handlers/check-order-status/util')
  return {
    ...original,
    getWatcher: jest.fn(),
    getProvider: jest.fn(),
    getValidator: jest.fn(),
  }
})

describe('checkOrderStatusService', () => {
  const mockedBlockNumber = 0
  const getFillEventsMock = jest.fn()
  const getFillInfoMock = jest.fn()

  const getBlockNumberMock = jest.fn().mockReturnValue(mockedBlockNumber)
  const getTransactionMock = jest.fn()
  let analyticsMock = {
    logCancelled: jest.fn(),
    logInsufficientFunds: jest.fn(),
  } as any
  describe('check order status', () => {
    let watcherMock: { getFillEvents: jest.Mock<any, any>; getFillInfo: jest.Mock<any, any> },
      providerMock: {
        getBlockNumber: jest.Mock<any, any>
        getTransaction: jest.Mock<any, any>
        getBlock: () => Promise<{ timestamp: number }>
      },
      validatorMock: { validate: jest.Mock<any, any> },
      ordersRepositoryMock: any,
      checkOrderStatusService: CheckOrderStatusService,
      openOrderRequest: CheckOrderStatusRequest

    beforeEach(() => {
      log.setLogLevel('SILENT')
      jest.clearAllMocks()
      ordersRepositoryMock = {
        updateOrderStatus: jest.fn(),
        getByHash: jest.fn(),
      } as any

      analyticsMock = {
        logCancelled: jest.fn(),
        logInsufficientFunds: jest.fn(),
      }

      checkOrderStatusService = new CheckOrderStatusService(
        ordersRepositoryMock,
        FILL_EVENT_LOOKBACK_BLOCKS_ON,
        mock<FillEventLogger>(),
        new CheckOrderStatusUtils(OrderType.Dutch, analyticsMock, ordersRepositoryMock, calculateDutchRetryWaitSeconds)
      )

      watcherMock = {
        getFillEvents: getFillEventsMock,
        getFillInfo: getFillInfoMock,
      }
      providerMock = {
        getBlockNumber: getBlockNumberMock,
        getTransaction: getTransactionMock,
        getBlock: () =>
          Promise.resolve({
            timestamp: 123456,
          }),
      }
      validatorMock = {
        validate: jest.fn(),
      }

      getTransactionMock.mockReturnValueOnce({
        wait: () =>
          Promise.resolve({
            effectiveGasPrice: BigNumber.from(1),
            gasUsed: 100,
          }),
      })

      ordersRepositoryMock.getByHash.mockResolvedValue(MOCK_ORDER_ENTITY)
      ordersRepositoryMock.updateOrderStatus.mockResolvedValue()

      openOrderRequest = {
        orderHash: MOCK_ORDER_HASH,
        chainId: 1,
        orderStatus: ORDER_STATUS.OPEN,
        provider: providerMock as any,
        orderWatcher: watcherMock as any,
        orderQuoter: validatorMock as any,
        quoteId: '',
        getFillLogAttempts: 0,
        startingBlockNumber: 0,
        retryCount: 0,
        orderType: OrderType.Dutch,
      }
    })

    describe('Expired', () => {
      beforeEach(() => {
        validatorMock.validate.mockResolvedValue(OrderValidation.Expired)
      })

      it('should close order with filled if expired and filled', async () => {
        getFillInfoMock.mockImplementation(() => {
          return [
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
          ]
        })

        const result = await checkOrderStatusService.handleRequest(openOrderRequest)

        expect(ordersRepositoryMock.getByHash).toHaveBeenCalled()
        expect(ordersRepositoryMock.updateOrderStatus).toHaveBeenCalled()
        expect(watcherMock.getFillInfo).toHaveBeenCalled()
        expect(providerMock.getTransaction).toHaveBeenCalled()
        expect(validatorMock.validate).toHaveBeenCalled()
        expect(result).toEqual(
          expect.objectContaining({
            orderStatus: 'filled',
            settledAmounts: [
              {
                tokenIn: '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9',
                amountIn: '1000000000000000000',
                tokenOut: 'WETH',
                amountOut: '1',
              },
            ],
            txHash: '0x1244345323',
          })
        )
      })

      it('should retry if expired and getFillLogAttempts = 0', async () => {
        getFillInfoMock.mockImplementation(() => {
          return []
        })

        const result = await checkOrderStatusService.handleRequest(openOrderRequest)

        expect(ordersRepositoryMock.getByHash).toHaveBeenCalled()
        expect(ordersRepositoryMock.updateOrderStatus).not.toHaveBeenCalled()
        expect(watcherMock.getFillInfo).toHaveBeenCalled()
        expect(providerMock.getTransaction).not.toHaveBeenCalled()
        expect(validatorMock.validate).toHaveBeenCalled()
        expect(result).toEqual(
          expect.objectContaining({
            getFillLogAttempts: 1,
          })
        )
      })

      it('should should update with expired if getFillLogAttempts = 1', async () => {
        getFillInfoMock.mockImplementation(() => {
          return []
        })

        const result = await checkOrderStatusService.handleRequest({
          ...openOrderRequest,
          getFillLogAttempts: 1,
        })

        expect(ordersRepositoryMock.getByHash).toHaveBeenCalled()
        expect(ordersRepositoryMock.updateOrderStatus).toHaveBeenCalled()
        expect(watcherMock.getFillInfo).toHaveBeenCalled()
        expect(providerMock.getTransaction).not.toHaveBeenCalled()
        expect(validatorMock.validate).toHaveBeenCalled()
        expect(result).toEqual(
          expect.objectContaining({
            orderStatus: 'expired',
          })
        )
      })
    })

    describe('OrderValidation.NonceUsed', () => {
      beforeEach(() => {
        validatorMock.validate.mockResolvedValue(OrderValidation.NonceUsed)
      })

      it('should close order with filled if nonce used and filled', async () => {
        getFillInfoMock.mockImplementation(() => {
          return [
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
          ]
        })

        const result = await checkOrderStatusService.handleRequest(openOrderRequest)

        expect(ordersRepositoryMock.getByHash).toHaveBeenCalled()
        expect(ordersRepositoryMock.updateOrderStatus).toHaveBeenCalled()
        expect(watcherMock.getFillInfo).toHaveBeenCalled()
        expect(providerMock.getTransaction).toHaveBeenCalled()
        expect(validatorMock.validate).toHaveBeenCalled()
        expect(result).toEqual(
          expect.objectContaining({
            orderStatus: 'filled',
            settledAmounts: [
              {
                tokenIn: '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9',
                amountIn: '1000000000000000000',
                tokenOut: 'WETH',
                amountOut: '1',
              },
            ],
            txHash: '0x1244345323',
          })
        )
      })

      it('should retry if nonce used and no fillEvent and getFillLogAttempts = 0', async () => {
        getFillInfoMock.mockImplementation(() => {
          return []
        })

        const result = await checkOrderStatusService.handleRequest(openOrderRequest)

        expect(ordersRepositoryMock.getByHash).toHaveBeenCalled()
        expect(ordersRepositoryMock.updateOrderStatus).not.toHaveBeenCalled()
        expect(watcherMock.getFillInfo).toHaveBeenCalled()
        expect(providerMock.getTransaction).not.toHaveBeenCalled()
        expect(validatorMock.validate).toHaveBeenCalled()
        expect(result).toEqual(
          expect.objectContaining({
            getFillLogAttempts: 1,
          })
        )
      })

      it('should should update with cancelled if getFillLogAttempts = 1', async () => {
        getFillInfoMock.mockImplementation(() => {
          return []
        })

        const result = await checkOrderStatusService.handleRequest({ ...openOrderRequest, getFillLogAttempts: 1 })

        expect(analyticsMock.logCancelled).toHaveBeenCalled()
        expect(ordersRepositoryMock.getByHash).toHaveBeenCalled()
        expect(ordersRepositoryMock.updateOrderStatus).toHaveBeenCalled()
        expect(watcherMock.getFillInfo).toHaveBeenCalled()
        expect(providerMock.getTransaction).not.toHaveBeenCalled()
        expect(validatorMock.validate).toHaveBeenCalled()
        expect(result).toEqual(
          expect.objectContaining({
            orderStatus: 'cancelled',
          })
        )
      })
    })

    describe('OrderValidation.InsufficientFunds', () => {
      beforeEach(() => {
        validatorMock.validate.mockResolvedValue(OrderValidation.InsufficientFunds)
      })

      it('should update status with insufficient-funds', async () => {
        const result = await checkOrderStatusService.handleRequest(openOrderRequest)

        expect(analyticsMock.logInsufficientFunds).toHaveBeenCalled()
        expect(ordersRepositoryMock.getByHash).toHaveBeenCalled()
        expect(ordersRepositoryMock.updateOrderStatus).toHaveBeenCalled()
        expect(validatorMock.validate).toHaveBeenCalled()
        expect(result).toEqual(
          expect.objectContaining({
            orderStatus: 'insufficient-funds',
          })
        )
      })
    })

    describe('OrderValidation.InvalidSignature', () => {
      beforeEach(() => {
        validatorMock.validate.mockResolvedValue(OrderValidation.InvalidSignature)
      })

      it('should update status with error', async () => {
        const result = await checkOrderStatusService.handleRequest(openOrderRequest)

        expect(ordersRepositoryMock.getByHash).toHaveBeenCalled()
        expect(ordersRepositoryMock.updateOrderStatus).toHaveBeenCalled()
        expect(validatorMock.validate).toHaveBeenCalled()
        expect(result).toEqual(
          expect.objectContaining({
            orderStatus: 'error',
          })
        )
      })
    })

    describe('OrderValidation.InvalidOrderFields', () => {
      beforeEach(() => {
        validatorMock.validate.mockResolvedValue(OrderValidation.InvalidOrderFields)
      })

      it('should update status with error', async () => {
        const result = await checkOrderStatusService.handleRequest(openOrderRequest)

        expect(ordersRepositoryMock.getByHash).toHaveBeenCalled()
        expect(ordersRepositoryMock.updateOrderStatus).toHaveBeenCalled()
        expect(validatorMock.validate).toHaveBeenCalled()
        expect(result).toEqual(
          expect.objectContaining({
            orderStatus: 'error',
          })
        )
      })
    })

    describe('OrderValidation.UnknownError', () => {
      beforeEach(() => {
        validatorMock.validate.mockResolvedValue(OrderValidation.UnknownError)
      })

      it('should update status with error', async () => {
        const result = await checkOrderStatusService.handleRequest(openOrderRequest)

        expect(ordersRepositoryMock.getByHash).toHaveBeenCalled()
        expect(ordersRepositoryMock.updateOrderStatus).toHaveBeenCalled()
        expect(validatorMock.validate).toHaveBeenCalled()
        expect(result).toEqual(
          expect.objectContaining({
            orderStatus: 'error',
          })
        )
      })
    })

    describe('Other Validations', () => {
      beforeEach(() => {
        validatorMock.validate.mockResolvedValue(OrderValidation.OK)
      })

      it('should not update', async () => {
        const result = await checkOrderStatusService.handleRequest(openOrderRequest)

        expect(ordersRepositoryMock.getByHash).toHaveBeenCalled()
        expect(ordersRepositoryMock.updateOrderStatus).not.toHaveBeenCalled()
        expect(validatorMock.validate).toHaveBeenCalled()
        expect(result).toEqual(
          expect.objectContaining({
            orderStatus: 'open',
          })
        )
      })
    })

    describe('OrderType', () => {
      beforeEach(() => {
        validatorMock.validate.mockResolvedValue(OrderValidation.Expired)
      })
      it('should close with filled for Dutch_V2 orderType', async () => {
        getFillInfoMock.mockImplementation(() => {
          return [
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
          ]
        })

        openOrderRequest.orderType = OrderType.Dutch_V2
        ordersRepositoryMock.getByHash.mockResolvedValue(MOCK_V2_ORDER_ENTITY)

        const result = await checkOrderStatusService.handleRequest(openOrderRequest)

        expect(ordersRepositoryMock.getByHash).toHaveBeenCalled()
        expect(ordersRepositoryMock.updateOrderStatus).toHaveBeenCalled()
        expect(watcherMock.getFillInfo).toHaveBeenCalled()
        expect(providerMock.getTransaction).toHaveBeenCalled()
        expect(validatorMock.validate).toHaveBeenCalled()
        expect(result).toEqual(
          expect.objectContaining({
            orderStatus: 'filled',
            settledAmounts: [
              {
                tokenIn: '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9',
                amountIn: '10000000000000000000',
                tokenOut: 'WETH',
                amountOut: '1',
              },
            ],
            txHash: '0x1244345323',
          })
        )
      })
      it('should close with filled for Limit orderType', async () => {
        getFillInfoMock.mockImplementation(() => {
          return [
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
          ]
        })

        openOrderRequest.orderType = OrderType.Limit

        const result = await checkOrderStatusService.handleRequest(openOrderRequest)

        expect(ordersRepositoryMock.getByHash).toHaveBeenCalled()
        expect(ordersRepositoryMock.updateOrderStatus).toHaveBeenCalled()
        expect(watcherMock.getFillInfo).toHaveBeenCalled()
        expect(providerMock.getTransaction).toHaveBeenCalled()
        expect(validatorMock.validate).toHaveBeenCalled()
        expect(result).toEqual(
          expect.objectContaining({
            orderStatus: 'filled',
            settledAmounts: [
              {
                tokenIn: '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9',
                amountIn: '1000000000000000000',
                tokenOut: 'WETH',
                amountOut: '1',
              },
            ],
            txHash: '0x1244345323',
          })
        )
      })
    })
  })
})
