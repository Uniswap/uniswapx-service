/* eslint-disable */
import { OrderValidation } from 'gouda-sdk'
import { OrderEntity, ORDER_STATUS } from '../../lib/entities/Order'
import { CheckOrderStatusHandler } from '../../lib/handlers/check-order-status/handler'

const MOCK_ORDER_HASH = '0xc57af022b96e1cb0da0267c15f1d45cdfccf57cfeb8b33869bb50d7f478ab203'
let MOCK_ENCODED_ORDER =
  '0x000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000e00000000000000000000000000000000000000000000000000000000063b62a4e0000000000000000000000000000000000000000000000000000000063b62ab2000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb4800000000000000000000000000000000000000000000000000000000000f424000000000000000000000000000000000000000000000000000000000000f424000000000000000000000000000000000000000000000000000000000000001c0000000000000000000000000e9781560d93c27aa4c4f3543631d191d10608d20000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000640000000000000000000000000000000000000000000000000000000063b62ab2000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000c000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc20000000000000000000000000000000000000000000000000de0b6b3a76400000000000000000000000000000000000000000000000000000c7d713b49da000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000'
const MOCK_SIGNATURE =
  '0x2e3090291fb13ca79272bd12a7af392e560ee314bc87f9d1df3b8e9f8b2030a002eb3ae6133017d60011de49cab73c81ae0759019ce61eed2038e88688f697d11b'
const MOCK_ORDER_ENTITY: OrderEntity = {
  encodedOrder: MOCK_ENCODED_ORDER,
  signature: MOCK_SIGNATURE,
  nonce: '0xnonce',
  orderHash: MOCK_ORDER_HASH,
  offerer: '0xofferer',
  orderStatus: ORDER_STATUS.UNVERIFIED,
}

describe('Testing check order status handler', () => {
  const validateMock = jest.fn()
  const getFillEventsMock = jest.fn()

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
      ).rejects.toThrowError('"chainId" must be one of [1, 5, TENDERLY]')
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
      expect(updateOrderStatusMock).toBeCalledWith(MOCK_ORDER_HASH, ORDER_STATUS.OPEN)
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
      expect(updateOrderStatusMock).toBeCalledWith(MOCK_ORDER_HASH, ORDER_STATUS.OPEN)
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
      expect(updateOrderStatusMock).toBeCalledWith(MOCK_ORDER_HASH, ORDER_STATUS.OPEN)
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
