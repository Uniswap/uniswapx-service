import { UniswapXOrderEntity } from '../../lib/entities'
import { BaseOrdersRepository, OrderStoreContext, PutOrderResult, QueryResult } from '../../lib/repositories/base'

export type CountOrdersCall = { offerer: string; max: number }

// A store context for tests: its warnings and errors are dropped.
export const TEST_STORE_CONTEXT: OrderStoreContext = { logger: { warn: () => undefined, error: () => undefined } }

// createdAt as the post path stamps it: epoch seconds from the (possibly frozen) clock.
export const nowSeconds = (): number => Math.floor(Date.now() / 1000)

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

  // Like the real store, counts no further than max + 1.
  async countOpenOrders(_ctx: OrderStoreContext, offerer: string, max: number): Promise<number> {
    this.countCalls.push({ offerer, max })
    if (this.countError) {
      throw this.countError
    }
    return Math.min(this.openOrderCount, max + 1)
  }

  // Like the real store, keeps the first write of an order hash.
  async putOrderAndUpdateNonce(_ctx: OrderStoreContext, order: UniswapXOrderEntity): Promise<PutOrderResult> {
    this.puts.push(order)
    if (this.putError) {
      throw this.putError
    }
    if (this.stored.has(order.orderHash)) {
      return 'already-stored'
    }
    this.stored.set(order.orderHash, order)
    return 'stored'
  }

  async getByHash(_ctx: OrderStoreContext, hash: string): Promise<UniswapXOrderEntity | undefined> {
    return this.stored.get(hash)
  }

  async getOrders(): Promise<QueryResult<UniswapXOrderEntity>> {
    throw notOnThePostPath('getOrders')
  }

  async getOrdersFilteredByType(): Promise<QueryResult<UniswapXOrderEntity>> {
    throw notOnThePostPath('getOrdersFilteredByType')
  }

  async getNonce(): Promise<string | undefined> {
    throw notOnThePostPath('getNonce')
  }

  async updateOrderStatus(): Promise<void> {
    throw notOnThePostPath('updateOrderStatus')
  }
}

function notOnThePostPath(method: string): Error {
  return new Error(`FakeOrdersRepository.${method} is not on the post path`)
}
