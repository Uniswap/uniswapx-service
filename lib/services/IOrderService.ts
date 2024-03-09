import { Order } from '../models/orders/Order'

export interface IOrderService<T extends Order> {
  // TODO: make this void
  // Create an order and return the order hash
  createOrder(order: T): Promise<string>
}
