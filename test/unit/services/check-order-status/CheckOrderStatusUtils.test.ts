import { OrderType, OrderValidation } from '@uniswap/uniswapx-sdk'
import { mock } from 'jest-mock-extended'
import { RelayOrderEntity, UniswapXOrderEntity } from '../../../../lib/entities'
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
    repository?: BaseOrdersRepository<UniswapXOrderEntity> | BaseOrdersRepository<RelayOrderEntity>
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
      })

      expect(response).toEqual({ getFillLogAttempts: 1, orderStatus: 'open' })
    })

    test('it returns expired when expired and getFillLogAttempts 2', () => {
      const service = buildService({})
      const response = service.getUnfilledStatusFromValidation({
        validation: OrderValidation.Expired,
        getFillLogAttempts: 1,
      })

      expect(response).toEqual({ getFillLogAttempts: 2, orderStatus: 'expired' })
    })

    test('increments getFillLogAttempts when NonceUsed and 0 attempts', () => {
      const service = buildService({})
      const response = service.getUnfilledStatusFromValidation({
        validation: OrderValidation.NonceUsed,
        getFillLogAttempts: 0,
      })

      expect(response).toEqual({ getFillLogAttempts: 1, orderStatus: 'open' })
    })

    test('it returns cancelled when NonceUsed and getFillLogAttempts 2', () => {
      const service = buildService({})
      const response = service.getUnfilledStatusFromValidation({
        validation: OrderValidation.NonceUsed,
        getFillLogAttempts: 1,
      })

      expect(response).toEqual({ getFillLogAttempts: 2, orderStatus: 'cancelled' })
    })

    test('it returns insufficient-funds when validation is InsufficientFunds', () => {
      const service = buildService({})
      const response = service.getUnfilledStatusFromValidation({
        validation: OrderValidation.InsufficientFunds,
        getFillLogAttempts: 1,
      })

      expect(response).toEqual({ orderStatus: 'insufficient-funds' })
    })

    test('it returns error when validation iserror', () => {
      const service = buildService({})
      const response = service.getUnfilledStatusFromValidation({
        validation: OrderValidation.UnknownError,
        getFillLogAttempts: 1,
      })

      expect(response).toEqual({ orderStatus: 'error' })
    })

    test('it returns error when validation is InvalidOrderFields', () => {
      const service = buildService({})
      const response = service.getUnfilledStatusFromValidation({
        validation: OrderValidation.InvalidOrderFields,
        getFillLogAttempts: 1,
      })

      expect(response).toEqual({ orderStatus: 'error' })
    })

    test('it returns error when validation is InvalidOrderFields', () => {
      const service = buildService({})
      const response = service.getUnfilledStatusFromValidation({
        validation: OrderValidation.InvalidSignature,
        getFillLogAttempts: 1,
      })

      expect(response).toEqual({ orderStatus: 'error' })
    })

    test('it returns open when validation is OK', () => {
      const service = buildService({})
      const response = service.getUnfilledStatusFromValidation({
        validation: OrderValidation.OK,
        getFillLogAttempts: 1,
      })

      expect(response).toEqual({ orderStatus: 'open' })
    })
  })
})
