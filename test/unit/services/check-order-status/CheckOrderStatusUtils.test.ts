import { OrderType, OrderValidation } from '@uniswap/uniswapx-sdk'
import { mock } from 'jest-mock-extended'
import { ORDER_STATUS, UniswapXOrderEntity } from '../../../../lib/entities'
import { CheckOrderStatusUtils } from '../../../../lib/handlers/check-order-status/service'
import { BaseOrdersRepository } from '../../../../lib/repositories/base'
import { DutchOrdersRepository } from '../../../../lib/repositories/dutch-orders-repository'
import { AnalyticsService, AnalyticsServiceInterface } from '../../../../lib/services/analytics-service'
import { ChainId } from '../../../../lib/util/chain'

describe('CheckOrderStatusUtils', () => {
  function buildService({
    serviceOrderType = OrderType.Dutch,
    analyticsService = mock<AnalyticsService>(),
    repository = mock<DutchOrdersRepository>(),
    calculateRetryWaitSeconds = () => 10,
  }: {
    serviceOrderType?: OrderType
    analyticsService?: AnalyticsServiceInterface
    repository?: BaseOrdersRepository<UniswapXOrderEntity>
    calculateRetryWaitSeconds?: (chainId: ChainId, retryCount: number) => number
  }) {
    return new CheckOrderStatusUtils(serviceOrderType, analyticsService, repository, calculateRetryWaitSeconds)
  }

  describe('getUnfilledStatusFromValidation', () => {
    test('increments getFillLogAttempts when expired and 0 attempts', () => {
      const service = buildService({})
      const response = service.getUnfilledStatusFromValidation({
        validation: OrderValidation.Expired,
        getFillLogAttempts: 0,
        lastStatus: ORDER_STATUS.OPEN,
      })

      expect(response).toEqual({ getFillLogAttempts: 1, orderStatus: 'open' })
    })

    test('it returns expired when expired and getFillLogAttempts 2', () => {
      const service = buildService({})
      const response = service.getUnfilledStatusFromValidation({
        validation: OrderValidation.Expired,
        getFillLogAttempts: 1,
        lastStatus: ORDER_STATUS.OPEN,
      })

      expect(response).toEqual({ getFillLogAttempts: 2, orderStatus: 'expired' })
    })

    test('increments getFillLogAttempts when NonceUsed and 0 attempts', () => {
      const service = buildService({})
      const response = service.getUnfilledStatusFromValidation({
        validation: OrderValidation.NonceUsed,
        getFillLogAttempts: 0,
        lastStatus: ORDER_STATUS.OPEN,
      })

      expect(response).toEqual({ getFillLogAttempts: 1, orderStatus: 'open' })
    })

    test('it returns cancelled when NonceUsed and getFillLogAttempts 2', () => {
      const service = buildService({})
      const response = service.getUnfilledStatusFromValidation({
        validation: OrderValidation.NonceUsed,
        getFillLogAttempts: 1,
        lastStatus: ORDER_STATUS.OPEN,
      })

      expect(response).toEqual({ getFillLogAttempts: 2, orderStatus: 'cancelled' })
    })

    test('it returns insufficient-funds when validation is InsufficientFunds', () => {
      const service = buildService({})
      const response = service.getUnfilledStatusFromValidation({
        validation: OrderValidation.InsufficientFunds,
        getFillLogAttempts: 1,
        lastStatus: ORDER_STATUS.OPEN,
      })

      expect(response).toEqual({ orderStatus: 'insufficient-funds' })
    })

    test('it keeps the current status (not terminal error) when validation is UnknownError', () => {
      // UnknownError is ambiguous/transient -- the order may be valid or already
      // filled. We must not finalize it as terminal ERROR; keep polling instead.
      // The grace-poll counter is carried through unchanged, not reset or advanced.
      const service = buildService({})
      const response = service.getUnfilledStatusFromValidation({
        validation: OrderValidation.UnknownError,
        getFillLogAttempts: 1,
        lastStatus: ORDER_STATUS.OPEN,
      })

      expect(response).toEqual({ orderStatus: 'open', getFillLogAttempts: 1 })
    })

    test('it does not overwrite insufficient-funds when validation is UnknownError', () => {
      // Regression: writing OPEN over INSUFFICIENT_FUNDS on an UnknownError poll
      // ping-pongs the status across polls, emitting a DB write and a downstream
      // webhook on every flip. UnknownError teaches us nothing about the order,
      // so the status it already has must be preserved.
      const service = buildService({})
      const response = service.getUnfilledStatusFromValidation({
        validation: OrderValidation.UnknownError,
        getFillLogAttempts: 0,
        lastStatus: ORDER_STATUS.INSUFFICIENT_FUNDS,
      })

      expect(response).toEqual({ orderStatus: 'insufficient-funds', getFillLogAttempts: 0 })
    })

    test('it returns error when validation is InvalidOrderFields', () => {
      const service = buildService({})
      const response = service.getUnfilledStatusFromValidation({
        validation: OrderValidation.InvalidOrderFields,
        getFillLogAttempts: 1,
        lastStatus: ORDER_STATUS.OPEN,
      })

      expect(response).toEqual({ orderStatus: 'error' })
    })

    test('it returns error when validation is InvalidSignature', () => {
      const service = buildService({})
      const response = service.getUnfilledStatusFromValidation({
        validation: OrderValidation.InvalidSignature,
        getFillLogAttempts: 1,
        lastStatus: ORDER_STATUS.OPEN,
      })

      expect(response).toEqual({ orderStatus: 'error' })
    })

    test('it returns open when validation is OK', () => {
      const service = buildService({})
      const response = service.getUnfilledStatusFromValidation({
        validation: OrderValidation.OK,
        getFillLogAttempts: 1,
        lastStatus: ORDER_STATUS.OPEN,
      })

      expect(response).toEqual({ orderStatus: 'open' })
    })
  })
})
