import { OrderType } from '@uniswap/uniswapx-sdk'
import {
  DutchV3OrderEntity,
  ORDER_STATUS,
  PriorityOrderEntity,
  SharedXOrderEntity,
  UniswapXOrderEntity,
} from '../../../lib/entities'
import { GetOrdersQueryParams } from '../../../lib/handlers/get-orders/schema'
import { BaseOrdersRepository } from '../../../lib/repositories/base'

/**
 * The fields a store test row sets: what the store keys on, plus the order-type fields some
 * tests round-trip. Rows are not full signed orders, so the one cast to the entity type lives
 * in orderRow().
 */
export type OrderRow = Pick<SharedXOrderEntity, 'orderHash' | 'offerer' | 'nonce' | 'chainId' | 'orderStatus'> &
  Partial<Pick<SharedXOrderEntity, 'encodedOrder' | 'signature' | 'filler' | 'quoteId' | 'requestId'>> & {
    type?: OrderType
    cosigner?: string
    cosignerData?: PriorityOrderEntity['cosignerData'] | DutchV3OrderEntity['cosignerData']
    auctionStartBlock?: number
    baselinePriorityFeeWei?: string
    startingBaseFee?: string
  }

export function orderRow(row: OrderRow): UniswapXOrderEntity {
  return { encodedOrder: 'encoded-order', signature: 'signature', ...row } as UniswapXOrderEntity
}

// Rows are stamped by a frozen clock (test/fakes/clock.ts) at BASE_SECONDS + tick. The base is in
// the future so a suite's rows are always the newest in the partitions it shares with test files
// running in parallel (the per-status partitions), whose rows carry the real time.
const BASE_SECONDS = 4_102_444_800 // 2100-01-01T00:00:00Z

export function createdAtTick(tick: number): number {
  return BASE_SECONDS + tick
}

export function tickMs(tick: number): number {
  return createdAtTick(tick) * 1000
}

// Moves the frozen clock; the next put stamps createdAt, created and modified with this time.
export function setClockToTick(tick: number): void {
  jest.setSystemTime(tickMs(tick))
}

export const CHAIN_A = 10
export const CHAIN_B = 137
export const CHAIN_C = 5

/**
 * The rows, swappers and fillers of one suite. Every order hash, offerer (and so every Nonces
 * key) and filler starts with `0x<scope>-`, so suites never read or clean up each other's rows
 * (as long as no scope starts with another scope plus a dash).
 * `rowExtras` carries the fields only one table's entity maps (LimitOrders has no requestId).
 */
export function storeFixtures(scope: string, rowExtras: Partial<Pick<OrderRow, 'quoteId' | 'requestId'>> = {}) {
  const prefix = `0x${scope}-`
  const row = (name: string, fields: Omit<OrderRow, 'orderHash'>): UniswapXOrderEntity =>
    orderRow({ ...rowExtras, orderHash: `${prefix}${name}`, ...fields })

  const swapperA = `${prefix}swapper-a`
  const swapperB = `${prefix}swapper-b`
  const nonceSwapper = `${prefix}swapper-nonce`
  const fillerA = `${prefix}filler-a`
  const fillerB = `${prefix}filler-b`
  const fillerC = `${prefix}filler-c`

  return {
    prefix,
    row,
    swapperA,
    swapperB,
    nonceSwapper,
    unknownSwapper: `${prefix}swapper-unknown`,
    fillerA,
    fillerB,
    fillerC,
    unknownFiller: `${prefix}filler-unknown`,
    missingHash: `${prefix}missing`,
    otherMissingHash: `${prefix}missing-too`,
    offerers: [swapperA, swapperB, nonceSwapper],
    chainIds: [CHAIN_A, CHAIN_B, CHAIN_C],
    order1: row('1', {
      offerer: swapperA,
      nonce: '1',
      chainId: CHAIN_A,
      orderStatus: ORDER_STATUS.OPEN,
      filler: fillerA,
    }),
    order2: row('2', {
      offerer: swapperB,
      nonce: '1',
      chainId: CHAIN_B,
      orderStatus: ORDER_STATUS.OPEN,
      filler: fillerA,
    }),
    order3: row('3', {
      offerer: swapperB,
      nonce: '2',
      chainId: CHAIN_B,
      orderStatus: ORDER_STATUS.FILLED,
      filler: fillerB,
    }),
    order4: row('4', {
      offerer: swapperA,
      nonce: '4',
      chainId: CHAIN_A,
      orderStatus: ORDER_STATUS.OPEN,
      filler: fillerC,
    }),
    order5: row('5', {
      offerer: swapperA,
      nonce: '1',
      chainId: CHAIN_A,
      orderStatus: ORDER_STATUS.OPEN,
      filler: fillerA,
    }),
    order6: row('6', {
      offerer: swapperA,
      nonce: '1',
      chainId: CHAIN_C,
      orderStatus: ORDER_STATUS.OPEN,
      type: OrderType.Dutch,
    }),
    // Status partitions are shared with other test files, so assertions on them look only at
    // this suite's rows.
    own: (orders: UniswapXOrderEntity[]) => orders.filter((o) => o.orderHash.startsWith(prefix)),
  }
}

/**
 * The item the store writes for `order` put at `tick`: the order itself, its compound GSI keys,
 * and dynamodb-toolbox's entity name and created/modified stamps (returned under those aliases).
 */
export function storedItem(order: UniswapXOrderEntity, tick: number, entity: string) {
  const { offerer, filler, chainId, orderStatus } = order
  const stamp = new Date(tickMs(tick)).toISOString()
  return {
    ...order,
    createdAt: createdAtTick(tick),
    created: stamp,
    modified: stamp,
    entity,
    offerer_orderStatus: `${offerer}_${orderStatus}`,
    filler_orderStatus: `${filler}_${orderStatus}`,
    filler_offerer: `${filler}_${offerer}`,
    chainId_filler: `${chainId}_${filler}`,
    chainId_orderStatus: `${chainId}_${orderStatus}`,
    chainId_orderStatus_filler: `${chainId}_${orderStatus}_${filler}`,
    filler_offerer_orderStatus: `${filler}_${offerer}_${orderStatus}`,
  }
}

export function hashes(orders: UniswapXOrderEntity[]): string[] {
  return orders.map((o) => o.orderHash)
}

// Follows the cursor from `cursor` to the end of the partition, `limit` rows at a time.
export async function readAllPages(
  repository: BaseOrdersRepository<UniswapXOrderEntity>,
  limit: number,
  queryFilters: GetOrdersQueryParams,
  cursor?: string
): Promise<UniswapXOrderEntity[]> {
  const orders: UniswapXOrderEntity[] = []
  do {
    const page = await repository.getOrders(limit, queryFilters, cursor)
    expect(page.orders.length).toBeLessThanOrEqual(limit)
    orders.push(...page.orders)
    cursor = page.cursor
  } while (cursor)
  return orders
}
