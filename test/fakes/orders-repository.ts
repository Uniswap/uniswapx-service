import { ORDER_STATUS, UniswapXOrderEntity } from '../../lib/entities'
import { BaseOrdersRepository, QueryResult } from '../../lib/repositories/base'

export type CountOrdersCall = { offerer: string; orderStatus: ORDER_STATUS }

// The orders table as the post path sees it: an open-order count per swapper and a write.
// Records every call, failed ones included; set the public fields to shape what calls return.
export class FakeOrdersRepository implements BaseOrdersRepository<UniswapXOrderEntity> {
  public readonly countCalls: CountOrdersCall[] = []
  // every attempted write, in order; only the ones that succeeded are stored
  public readonly puts: UniswapXOrderEntity[] = []
  private readonly stored = new Map<string, UniswapXOrderEntity>()

  public openOrderCount = 0
  public countError?: Error
  public putError?: Error

  async countOrdersByOffererAndStatus(offerer: string, orderStatus: ORDER_STATUS): Promise<number> {
    this.countCalls.push({ offerer, orderStatus })
    if (this.countError) {
      throw this.countError
    }
    return this.openOrderCount
  }

  async putOrderAndUpdateNonceTransaction(order: UniswapXOrderEntity): Promise<void> {
    this.puts.push(order)
    if (this.putError) {
      throw this.putError
    }
    this.stored.set(order.orderHash, order)
  }

  async getByHash(hash: string): Promise<UniswapXOrderEntity | undefined> {
    return this.stored.get(hash)
  }

  async getOrders(): Promise<QueryResult<UniswapXOrderEntity>> {
    throw notOnThePostPath('getOrders')
  }

  async getOrdersFilteredByType(): Promise<QueryResult<UniswapXOrderEntity>> {
    throw notOnThePostPath('getOrdersFilteredByType')
  }

  async getNonceByAddressAndChain(): Promise<string | undefined> {
    throw notOnThePostPath('getNonceByAddressAndChain')
  }

  async updateOrderStatus(): Promise<void> {
    throw notOnThePostPath('updateOrderStatus')
  }
}

function notOnThePostPath(method: string): Error {
  return new Error(`FakeOrdersRepository.${method} is not on the post path`)
}
