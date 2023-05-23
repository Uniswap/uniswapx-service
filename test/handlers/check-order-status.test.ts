/* eslint-disable */
import { OrderType, OrderValidation } from '@uniswap/gouda-sdk'
import { OrderEntity, ORDER_STATUS } from '../../lib/entities'
import { CheckOrderStatusHandler } from '../../lib/handlers/check-order-status/handler'

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
  orderStatus: ORDER_STATUS.UNVERIFIED,
  type: OrderType.DutchLimit,
  chainId: 1,
  reactor: '0x1',
  startTime: 1,
  endTime: 2,
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
    },
  ],
}

describe('Testing check order status handler', () => {
  const validateMock = jest.fn()
  const getFillEventsMock = jest.fn()
  const getFillInfoMock = jest.fn()

  const getByHashMock = jest.fn().mockReturnValue(MOCK_ORDER_ENTITY)
  const updateOrderStatusMock = jest.fn().mockReturnValue(Promise<void>)
  const providerMock = jest.fn().mockReturnValue(123)

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
          },
        }
      },
    }
  }

  describe('Test invalid input fields', () => {
    const injectorPromiseMock: any = buildInjectorPromiseMock(0, ORDER_STATUS.UNVERIFIED)
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
        '"orderStatus" must be one of [open, filled, cancelled, expired, error, unverified, insufficient-funds]'
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
      ).rejects.toThrowError('"chainId" must be one of [1, TENDERLY, 137]')
    })
  })

  describe('Test valid order', () => {
    const initialInjectorPromiseMock: any = buildInjectorPromiseMock(0, ORDER_STATUS.UNVERIFIED)
    const handlerEventMock = {
      orderHash: MOCK_ORDER_HASH,
      orderStatus: ORDER_STATUS.UNVERIFIED as string,
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
      expect(updateOrderStatusMock).toBeCalledWith(MOCK_ORDER_HASH, ORDER_STATUS.OPEN, undefined, undefined)
      expect(response).toEqual({
        orderHash: MOCK_ORDER_HASH,
        orderStatus: 'open',
        retryCount: 1,
        retryWaitSeconds: 12,
        chainId: 1,
        lastBlockNumber: 123,
      })
    })

    it('should do exponential backoff when retry count > 300', async () => {
      const injectorPromiseMock: any = buildInjectorPromiseMock(301, ORDER_STATUS.UNVERIFIED)
      const checkOrderStatusHandler = new CheckOrderStatusHandler('check-order-status', injectorPromiseMock)
      validateMock.mockReturnValue(OrderValidation.OK)
      const response = await checkOrderStatusHandler.handler(handlerEventMock)
      expect(getByHashMock).toBeCalledWith(MOCK_ORDER_HASH)
      expect(validateMock).toBeCalled()
      expect(updateOrderStatusMock).toBeCalledWith(MOCK_ORDER_HASH, ORDER_STATUS.OPEN, undefined, undefined)
      expect(response).toEqual({
        orderHash: MOCK_ORDER_HASH,
        orderStatus: 'open',
        retryCount: 302,
        retryWaitSeconds: 13,
        chainId: 1,
        lastBlockNumber: 123,
      })
    })

    it('should cap exponential backoff when wait interval reaches 18000 seconds', async () => {
      const injectorPromiseMock: any = buildInjectorPromiseMock(500, ORDER_STATUS.UNVERIFIED)
      const checkOrderStatusHandler = new CheckOrderStatusHandler('check-order-status', injectorPromiseMock)
      validateMock.mockReturnValue(OrderValidation.OK)
      const response = await checkOrderStatusHandler.handler(handlerEventMock)
      expect(getByHashMock).toBeCalledWith(MOCK_ORDER_HASH)
      expect(validateMock).toBeCalled()
      expect(updateOrderStatusMock).toBeCalledWith(MOCK_ORDER_HASH, ORDER_STATUS.OPEN, undefined, undefined)
      expect(response).toEqual({
        orderHash: MOCK_ORDER_HASH,
        orderStatus: 'open',
        retryCount: 501,
        retryWaitSeconds: 18000,
        chainId: 1,
        lastBlockNumber: 123,
      })
    })
  })
})
