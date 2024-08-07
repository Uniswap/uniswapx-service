import { UniswapXOrderEntity } from '../../../lib/entities'
import { BaseOrdersRepository } from '../../../lib/repositories/base'
import { DYNAMO_BATCH_WRITE_MAX } from '../../../lib/util/constants'

export async function deleteAllRepoEntries(ordersRepository: BaseOrdersRepository<UniswapXOrderEntity>) {
  for (const chainId of [1, 137]) {
    let orders = await ordersRepository.getOrders(DYNAMO_BATCH_WRITE_MAX, { chainId })
    if (!orders.orders.length) {
      return
    }
    do {
      await ordersRepository.deleteOrders(orders.orders.map((o) => o.orderHash))
    } while (orders.cursor && (orders = await ordersRepository.getOrders(DYNAMO_BATCH_WRITE_MAX, { chainId })))
  }
}
