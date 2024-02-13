import { BaseOrdersRepository } from '../lib/repositories/base'

export class HeaderExpectation {
  private headers: { [header: string]: string | number | boolean } | undefined

  constructor(headers: { [header: string]: string | number | boolean } | undefined) {
    this.headers = headers
  }

  public toReturnJsonContentType() {
    expect(this.headers).toHaveProperty('Content-Type', 'application/json')
    return this
  }

  public toAllowAllOrigin() {
    expect(this.headers).toHaveProperty('Access-Control-Allow-Origin', '*')
    return this
  }

  public toAllowCredentials() {
    expect(this.headers).toHaveProperty('Access-Control-Allow-Credentials', true)
    return this
  }
}

export async function deleteAllRepoEntries(ordersRepository: BaseOrdersRepository) {
  let orders = await ordersRepository.getOrders(25, { chainId: 1 })
  if (!orders.orders.length) {
    return
  }
  do {
    ordersRepository.deleteOrders(orders.orders.map((o) => o.orderHash))
  } while (orders.cursor && (orders = await ordersRepository.getOrders(25, { chainId: 1 })))
}
