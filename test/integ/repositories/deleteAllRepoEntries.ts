import { DutchOrderEntity } from '../../../lib/entities'
import { BaseOrdersRepository } from '../../../lib/repositories/base'
import { DYNAMO_BATCH_WRITE_MAX } from '../../../lib/util/constants'

export async function deleteAllRepoEntries(ordersRepository: BaseOrdersRepository<DutchOrderEntity>) {
  let orders = await ordersRepository.getOrders(DYNAMO_BATCH_WRITE_MAX, { chainId: 1 })
  if (!orders.orders.length) {
    return
  }
  do {
    await ordersRepository.deleteOrders(orders.orders.map((o) => o.orderHash))
  } while (orders.cursor && (orders = await ordersRepository.getOrders(DYNAMO_BATCH_WRITE_MAX, { chainId: 1 })))
}
