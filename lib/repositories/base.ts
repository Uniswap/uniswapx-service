import { OrderEntity } from '../entities/index'

export interface BaseOrdersRepository {
  getByHash: (hash: string) => Promise<OrderEntity | undefined>
  putOrderAndUpdateNonceTransaction: (order: OrderEntity) => Promise<void>
  put: (order: OrderEntity) => Promise<void>
}
