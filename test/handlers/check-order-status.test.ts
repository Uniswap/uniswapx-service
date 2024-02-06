/* eslint-disable */

import {
  DutchInput,
  DutchOutput,
  OrderType,
  OrderValidation,
  REACTOR_ADDRESS_MAPPING,
  TokenTransfer,
} from '@uniswap/uniswapx-sdk'
import { BigNumber } from 'ethers'
import { OrderEntity, ORDER_STATUS } from '../../lib/entities'
import { CheckOrderStatusHandler, FILL_EVENT_LOOKBACK_BLOCKS_ON } from '../../lib/handlers/check-order-status/handler'
import { CheckOrderStatusService } from '../../lib/handlers/check-order-status/service'
import { NATIVE_ADDRESS } from '../../lib/util/constants'
import { ORDER_INFO } from '../fixtures'

const MOCK_ORDER_HASH = '0xc57af022b96e1cb0da0267c15f1d45cdfccf57cfeb8b33869bb50d7f478ab203'
let MOCK_ENCODED_ORDER =
  '0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000012000000000000000000000000000000000000000000000000000000000644844ea000000000000000000000000000000000000000000000000000000006448454e00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000cf7ed3acca5a467e9e704c703e8d87f634fb0fc90000000000000000000000000000000000000000000000000de0b6b3a76400000000000000000000000000000000000000000000000000000de0b6b3a76400000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000e7f1725e7734ce288f8367e1bb143e90bb3f051200000000000000000000000079cbd6e23db4b71288d4273cfe9e4c6f729838900000000000000000000000000000000000000000000000000000000000000064000000000000000000000000000000000000000000000000000000006448454e000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000c000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000dc64a140aa3e981100a9beca4e685f962f0cf6c90000000000000000000000000000000000000000000000000de0b6b3a76400000000000000000000000000000000000000000000000000000c7d713b49da000000000000000000000000000079cbd6e23db4b71288d4273cfe9e4c6f72983890'
const MOCK_SIGNATURE =
  '0x5cb4a416206783ec0939d40258f7ed6f2b3d68cb5e3645a0e5460b1524055d6e505996cbeac2240edf0fdd2827bd35a8f673a34a17563b1e0d8c8cdef6d93cc61b'
const MOCK_ORDER_ENTITY: OrderEntity = {
  encodedOrder: MOCK_ENCODED_ORDER,
  signature: MOCK_SIGNATURE,
  nonce: '0xnonce',
  orderHash: MOCK_ORDER_HASH,
  offerer: '0xofferer',
  orderStatus: ORDER_STATUS.OPEN,
  type: OrderType.Dutch,
  chainId: 1,
  reactor: REACTOR_ADDRESS_MAPPING[1][OrderType.Dutch],
  decayStartTime: 1,
  decayEndTime: 2,
  deadline: 3,
  input: {
    token: '0xinput',
    startAmount: '1000000000000000000',
    endAmount: '1000000000000000000',
  },
  outputs: [
    {
      token: '0xoutput',
      startAmount: '2000000000000000000',
      endAmount: '1000000000000000000',
      recipient: '0xrecipient',
    },
  ],
}

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
    const checkOrderStatusHandler = new CheckOrderStatusService()

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

      const settledAmounts = checkOrderStatusHandler.getSettledAmounts(mockFillInfo, 100, mockDutchOrder)
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

      const settledAmounts = checkOrderStatusHandler.getSettledAmounts(mockFillInfo, 100, mockDutchOrder)
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

      const settledAmounts = checkOrderStatusHandler.getSettledAmounts(mockFillInfo, 100, mockDutchOrder)
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

      const settledAmounts = checkOrderStatusHandler.getSettledAmounts(mockFillInfo, 100, mockDutchOrder)
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
