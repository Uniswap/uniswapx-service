import { default as Logger } from 'bunyan'
import { DutchLimitOrder, OrderValidation } from 'gouda-sdk'
import Joi from 'joi'
import { ORDER_STATUS } from '../../entities/Order'
import { checkDefined } from '../../preconditions/preconditions'
import { BaseOrdersRepository } from '../../repositories/base'
import { SfnLambdaHandler, SfnStateInputOutput } from '../base/handler'
import { ContainerInjected, RequestInjected } from './injector'
import { CheckOrderStatusInputJoi } from './schema'

export class CheckOrderStatusHandler extends SfnLambdaHandler<ContainerInjected, RequestInjected> {
  public async handleRequest(input: {
    containerInjected: ContainerInjected
    requestInjected: RequestInjected
  }): Promise<SfnStateInputOutput> {
    const { dbInterface } = input.containerInjected
    const { log, chainId, orderHash, lastBlockNumber, retryCount, provider, orderWatcher, orderQuoter } =
      input.requestInjected

    const order = checkDefined(
      await dbInterface.getByHash(orderHash),
      'cannot find order by hash when updating order status'
    )

    const parsedOrder = DutchLimitOrder.parse(order.encodedOrder, chainId)
    const blockNumber = await provider.getBlockNumber()

    const validation = await orderQuoter.validate({ order: parsedOrder, signature: order.signature })
    switch (validation) {
      case OrderValidation.Expired:
        return this.updateStatusAndReturn(
          {
            dbInterface,
            orderHash,
            retryCount,
            lastBlockNumber: blockNumber,
            chainId,
            orderStatus: ORDER_STATUS.EXPIRED,
          },
          log
        )
      case OrderValidation.InsufficientFunds:
        return this.updateStatusAndReturn(
          {
            dbInterface,
            orderHash,
            retryCount,
            lastBlockNumber: blockNumber,
            chainId,
            orderStatus: ORDER_STATUS.INSUFFICIENT_FUNDS,
          },
          log
        )
      case OrderValidation.InvalidSignature:
      case OrderValidation.InvalidOrderFields:
      case OrderValidation.UnknownError:
        return this.updateStatusAndReturn(
          {
            dbInterface,
            orderHash,
            retryCount,
            lastBlockNumber: blockNumber,
            chainId,
            orderStatus: ORDER_STATUS.ERROR,
          },
          log
        )
      case OrderValidation.NonceUsed: {
        const fromBlock = lastBlockNumber === 0 ? blockNumber - 5 : lastBlockNumber
        const events = await orderWatcher.getFillEvents(fromBlock, blockNumber)
        if (events.find((e) => e.orderHash === orderHash)) {
          return this.updateStatusAndReturn(
            {
              dbInterface,
              orderHash,
              retryCount,
              lastBlockNumber: blockNumber,
              chainId,
              orderStatus: ORDER_STATUS.FILLED,
            },
            log
          )
        } else {
          return this.updateStatusAndReturn(
            {
              dbInterface,
              orderHash,
              retryCount,
              lastBlockNumber: blockNumber,
              chainId,
              orderStatus: ORDER_STATUS.CANCELLED,
            },
            log
          )
        }
      }
      default:
        return this.updateStatusAndReturn(
          {
            dbInterface,
            orderHash,
            retryCount,
            lastBlockNumber: blockNumber,
            chainId,
            orderStatus: ORDER_STATUS.OPEN,
          },
          log
        )
    }

    // const curBlockNumber = await provider.getBlockNumber()

    // const isFilled = await reactorContract.queryFilter(
    //   reactorContract.filters.Fill(orderHash),
    //   lastBlockNumber,
    //   curBlockNumber
    // )

    // if (isFilled.length > 0) {
    //   return this.updateStatusAndReturn(
    //     dbInterface,
    //     orderHash,
    //     retryCount,
    //     curBlockNumber,
    //     chainId,
    //     ORDER_STATUS.FILLED
    //   )
    // }

    // // check for Cancel event
    // // TODO: use Pertmi2Contract.queryFilter() after Cancel event is finalized
    // const watcher = new EventWatcher(provider, reactorContract.address)
  }

  private async updateStatusAndReturn(
    params: {
      dbInterface: BaseOrdersRepository
      orderHash: string
      retryCount: number
      lastBlockNumber: number
      chainId: number
      orderStatus: ORDER_STATUS
    },
    log?: Logger
  ): Promise<SfnStateInputOutput> {
    const { dbInterface, orderHash, retryCount, lastBlockNumber, chainId, orderStatus } = params

    log?.info(params, 'updating order status')
    await dbInterface.updateOrderStatus(orderHash, orderStatus)
    return {
      orderHash: orderHash,
      orderStatus: orderStatus,
      retryCount: retryCount + 1,
      retryWaitSeconds: this.calculateRetryWaitSeconds(retryCount),
      lastBlockNumber: lastBlockNumber,
      chainId: chainId,
    }
  }

  protected inputSchema(): Joi.ObjectSchema | null {
    return CheckOrderStatusInputJoi
  }

  /*
   * In the first hour of order submission, we check the order status roughly every block.
   * We then do exponential backoff on the wait time until the interval reaches roughly 6 hours.
   * All subsequent retries are at 6 hour intervals.
   */
  private calculateRetryWaitSeconds(retryCount: number): number {
    return retryCount <= 300 ? 12 : retryCount <= 450 ? Math.ceil(12 * Math.pow(1.05, retryCount - 300)) : 18000
  }
}
