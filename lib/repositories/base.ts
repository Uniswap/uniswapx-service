import { OrderEntity } from '../entities/index'

export interface BaseOrdersRepository {
  getByHash: (hash: string) => Promise<OrderEntity | undefined>
  put: (order: OrderEntity) => Promise<void>
}
