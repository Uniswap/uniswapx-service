import { Logger } from '@aws-lambda-powertools/logger'
import { OrderType, OrderValidation, OrderValidator } from '@uniswap/uniswapx-sdk'
import { mock } from 'jest-mock-extended'
import { UniswapXOrderEntity } from '../../../lib/entities'
import { OnChainValidatorMap } from '../../../lib/handlers/OnChainValidatorMap'
import { kickoffOrderTrackingSfn } from '../../../lib/handlers/shared/sfn'
import { LimitOrder } from '../../../lib/models/LimitOrder'
import { BaseOrdersRepository } from '../../../lib/repositories/base'
import { AnalyticsService } from '../../../lib/services/analytics-service'
import { UniswapXOrderService } from '../../../lib/services/UniswapXOrderService'
import { OrderValidator as OffChainOrderValidator } from '../../../lib/util/order-validator'
import { SDKDutchOrderFactory } from '../../factories/SDKDutchOrderV1Factory'
jest.mock('../../../lib/handlers/shared/sfn', () => {
  return { kickoffOrderTrackingSfn: jest.fn() }
})

jest.mock('../../../lib/preconditions/preconditions', () => {
  return { checkDefined: jest.fn() }
})
describe('UniswapXOrderService', () => {
  test('createOrder with LimitOrder, propagates correct type', async () => {
    const mockOrderValidator = mock<OffChainOrderValidator>()
    mockOrderValidator.validate.mockReturnValue({ valid: true })

    const onChainValidator = mock<OrderValidator>()
    onChainValidator.validate.mockResolvedValue(OrderValidation.OK)

    const onChainValidatorMap = mock<OnChainValidatorMap<OrderValidator>>()
    onChainValidatorMap.get.mockReturnValue(onChainValidator)

    const repository = mock<BaseOrdersRepository<UniswapXOrderEntity>>()
    const logger = mock<Logger>()
    const AnalyticsService = mock<AnalyticsService>()

    const service = new UniswapXOrderService(
      mockOrderValidator,
      onChainValidatorMap,
      repository as unknown as BaseOrdersRepository<UniswapXOrderEntity>,
      logger,
      () => {
        return 10
      },
      AnalyticsService
    )

    const order = SDKDutchOrderFactory.buildLimitOrder()

    const response = await service.createOrder(new LimitOrder(order, '0x00', 1))

    expect(response).not.toBeNull()
    expect(mockOrderValidator.validate).toHaveBeenCalled()
    expect(onChainValidatorMap.get(1).validate).toHaveBeenCalled()
    expect(repository.countOrdersByOffererAndStatus).toHaveBeenCalled()
    expect(repository.putOrderAndUpdateNonceTransaction).toHaveBeenCalled()
    expect(AnalyticsService.logOrderPosted).toHaveBeenCalledWith(expect.anything(), OrderType.Limit)
    expect(kickoffOrderTrackingSfn).toHaveBeenCalledWith(
      {
        chainId: 1,
        orderHash: response,
        orderStatus: 'open',
        orderType: 'Limit',
        quoteId: '',
        stateMachineArn: undefined,
      },
      undefined
    )
  })
})
