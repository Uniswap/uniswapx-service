/* eslint-disable */
import { DutchInput, DutchOutput, OrderValidation, TokenTransfer } from '@uniswap/uniswapx-sdk'
import { BigNumber } from 'ethers'
import { ORDER_STATUS } from '../../../lib/entities'
import { CheckOrderStatusHandler } from '../../../lib/handlers/check-order-status/handler'
import { FILL_EVENT_LOOKBACK_BLOCKS_ON, getSettledAmounts } from '../../../lib/handlers/check-order-status/util'
import { NATIVE_ADDRESS } from '../../../lib/util/constants'
import { ORDER_INFO } from '../fixtures'
import { MOCK_ORDER_ENTITY, MOCK_ORDER_HASH } from './test-data'

describe('Testing check order status handler', () => {
  const mockedBlockNumber = 123
  const validateMock = jest.fn()
  const getFillEventsMock = jest.fn()
  const getFillInfoMock = jest.fn()

  const getByHashMock = jest.fn().mockReturnValue(MOCK_ORDER_ENTITY)
  const updateOrderStatusMock = jest.fn().mockReturnValue(Promise<void>)
  const providerMock = jest.fn().mockReturnValue(mockedBlockNumber)
  const getTransactionMock = jest.fn()

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
          log: { info: () => jest.fn(), error: () => jest.fn() },
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
    const checkOrderStatusHandler = new CheckOrderStatusHandler('check-order-status', injectorPromiseMock)

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
      ).rejects.toThrowError(`"chainId" must be one of [1, 5, 137]`)
    })
  })

  describe('Test valid order', () => {
    const initialInjectorPromiseMock: any = buildInjectorPromiseMock(0, ORDER_STATUS.OPEN)
    const handlerEventMock = {
      orderHash: MOCK_ORDER_HASH,
      orderStatus: ORDER_STATUS.OPEN as string,
      chainId: 1,
    }

    beforeEach(() => {
      jest.clearAllMocks()
    })

    it('should return expired order status', async () => {
      const checkorderStatusHandler = new CheckOrderStatusHandler('check-order-status', initialInjectorPromiseMock)
      validateMock.mockReturnValue(OrderValidation.Expired)
      getFillInfoMock.mockReturnValue([])
      expect(await checkorderStatusHandler.handler(handlerEventMock)).toMatchObject({
        orderStatus: ORDER_STATUS.EXPIRED,
      })
    })

    it('should check fill events when order expired', async () => {
      const checkorderStatusHandler = new CheckOrderStatusHandler('check-order-status', initialInjectorPromiseMock)
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

      expect(await checkorderStatusHandler.handler(handlerEventMock)).toMatchObject({
        orderStatus: ORDER_STATUS.FILLED,
      })
      expect(getFillInfoMock).toBeCalled()
    })

    it('should check fill events when nonceUsed', async () => {
      const checkorderStatusHandler = new CheckOrderStatusHandler('check-order-status', initialInjectorPromiseMock)
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

      expect(await checkorderStatusHandler.handler(handlerEventMock)).toMatchObject({
        orderStatus: ORDER_STATUS.FILLED,
      })
      expect(updateOrderStatusMock).toBeCalled()
      expect(getFillInfoMock).toBeCalled()
    })

    it('should return insufficient-funds order status', async () => {
      const checkorderStatusHandler = new CheckOrderStatusHandler('check-order-status', initialInjectorPromiseMock)
      validateMock.mockReturnValue(OrderValidation.InsufficientFunds)
      expect(await checkorderStatusHandler.handler(handlerEventMock)).toMatchObject({
        orderStatus: ORDER_STATUS.INSUFFICIENT_FUNDS,
      })
    })

    it('should return error order status', async () => {
      const checkorderStatusHandler = new CheckOrderStatusHandler('check-order-status', initialInjectorPromiseMock)
      validateMock
        .mockReturnValueOnce(OrderValidation.UnknownError)
        .mockReturnValueOnce(OrderValidation.InvalidSignature)
        .mockReturnValueOnce(OrderValidation.InvalidOrderFields)

      for (let i = 0; i < 3; i++) {
        expect(await checkorderStatusHandler.handler(handlerEventMock)).toMatchObject({
          orderStatus: ORDER_STATUS.ERROR,
        })
      }
    })

    it('return latest on-chain status and increment retry count', async () => {
      const checkOrderStatusHandler = new CheckOrderStatusHandler('check-order-status', initialInjectorPromiseMock)
      validateMock.mockReturnValue(OrderValidation.OK)
      const response = await checkOrderStatusHandler.handler(handlerEventMock)
      expect(getByHashMock).toBeCalledWith(MOCK_ORDER_HASH)
      expect(validateMock).toBeCalled()
      expect(updateOrderStatusMock).not.toBeCalled() // there is no update
      expect(response).toEqual({
        orderHash: MOCK_ORDER_HASH,
        orderStatus: 'open',
        retryCount: 1,
        retryWaitSeconds: 12,
        chainId: 1,
        startingBlockNumber: mockedBlockNumber - FILL_EVENT_LOOKBACK_BLOCKS_ON(1),
      })
    })

    it('should do exponential backoff when retry count > 300', async () => {
      const injectorPromiseMock: any = buildInjectorPromiseMock(301, ORDER_STATUS.OPEN)
      const checkOrderStatusHandler = new CheckOrderStatusHandler('check-order-status', injectorPromiseMock)
      validateMock.mockReturnValue(OrderValidation.OK)
      const response = await checkOrderStatusHandler.handler(handlerEventMock)
      expect(getByHashMock).toBeCalledWith(MOCK_ORDER_HASH)
      expect(validateMock).toBeCalled()
      expect(updateOrderStatusMock).not.toBeCalled() // there is no update
      expect(response).toEqual({
        orderHash: MOCK_ORDER_HASH,
        orderStatus: 'open',
        retryCount: 302,
        retryWaitSeconds: 13,
        chainId: 1,
        startingBlockNumber: mockedBlockNumber - FILL_EVENT_LOOKBACK_BLOCKS_ON(1),
      })
    })

    it('should cap exponential backoff when wait interval reaches 18000 seconds', async () => {
      const injectorPromiseMock: any = buildInjectorPromiseMock(500, ORDER_STATUS.OPEN)
      const checkOrderStatusHandler = new CheckOrderStatusHandler('check-order-status', injectorPromiseMock)
      validateMock.mockReturnValue(OrderValidation.OK)
      const response = await checkOrderStatusHandler.handler(handlerEventMock)
      expect(getByHashMock).toBeCalledWith(MOCK_ORDER_HASH)
      expect(validateMock).toBeCalled()
      expect(updateOrderStatusMock).not.toBeCalled() // there is no update
      expect(response).toEqual({
        orderHash: MOCK_ORDER_HASH,
        orderStatus: 'open',
        retryCount: 501,
        retryWaitSeconds: 18000,
        chainId: 1,
        startingBlockNumber: mockedBlockNumber - FILL_EVENT_LOOKBACK_BLOCKS_ON(1),
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
