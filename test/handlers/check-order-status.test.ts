/* eslint-disable */
import { OrderValidation } from 'gouda-sdk'
import { OrderEntity, ORDER_STATUS } from '../../lib/entities/Order'
import { CheckOrderStatusHandler } from '../../lib/handlers/check-order-status/handler'

const MOCK_ORDER_HASH = '0xc57af022b96e1cb0da0267c15f1d45cdfccf57cfeb8b33869bb50d7f478ab203'
const MOCK_ENCODED_ORDER =
  '0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000fed118a23462d91256d19c742e9feab66f426e6e0000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000007b000000000000000000000000000000000000000000000000000000006371320400000000000000000000000000000000000000000000000000000000635865f7000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb4800000000000000000000000000000000000000000000000000000000000f424000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc20000000000000000000000000000000000000000000000000de0b6b3a76400000000000000000000000000000000000000000000000000000c7d713b49da00000000000000000000000000000000000000000000000000000000000000000000'
const MOCK_SIGNATURE =
  '0xf54b2d259bd7dfc61d18735f4210040735af3295c42849e85833b4afd317fc781213a8ac4c906c99762543611d183c3e62a702e8c70642e880d2902d57bcf2611b'
const MOCK_ORDER_ENTITY: OrderEntity = {
  encodedOrder: MOCK_ENCODED_ORDER,
  signature: MOCK_SIGNATURE,
  nonce: '0xnonce',
  orderHash: MOCK_ORDER_HASH,
  offerer: '0xofferer',
  orderStatus: ORDER_STATUS.UNVERIFIED,
}

describe('Testing check order status handler', () => {
  const updateStatusAndReturnMock = jest.spyOn(CheckOrderStatusHandler.prototype as any, 'updateStatusAndReturn')
  const validateMock = jest.fn()

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
      ).rejects.toThrowError('"chainId" must be one of [1, 5]')
    })
  })

  describe('Test valid order', () => {
    it('return latest on-chain status and increment retry count', async () => {
      const injectorPromiseMock: any = buildInjectorPromiseMock(0, ORDER_STATUS.UNVERIFIED)
      const checkOrderStatusHandler = new CheckOrderStatusHandler('check-order-status', injectorPromiseMock)
      validateMock.mockReturnValue(OrderValidation.OK)
      const response = await checkOrderStatusHandler.handler({
        orderHash: MOCK_ORDER_HASH,
        orderStatus: ORDER_STATUS.UNVERIFIED as string,
        chainId: 1,
      })
      expect(getByHashMock).toBeCalledWith(MOCK_ORDER_HASH)
      expect(validateMock).toBeCalled()
      expect(updateStatusAndReturnMock).toBeCalled()
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
      const response = await checkOrderStatusHandler.handler({
        orderHash: MOCK_ORDER_HASH,
        orderStatus: ORDER_STATUS.UNVERIFIED as string,
        chainId: 1,
      })
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
      const response = await checkOrderStatusHandler.handler({
        orderHash: MOCK_ORDER_HASH,
        orderStatus: ORDER_STATUS.UNVERIFIED as string,
        chainId: 1,
      })
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
