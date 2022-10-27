import { OrderEntity } from '../entities/index'

export interface BaseOrdersRepository {
  getByHash: (hash: string) => Promise<OrderEntity[]>
}
