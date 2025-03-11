import { SORT_FIELDS } from '../../../lib/entities'
import { GetOrdersQueryParams } from '../../../lib/handlers/get-orders/schema'

export class QueryParamsBuilder {
  constructor(private params: GetOrdersQueryParams = {}) {}

  withFiller(value?: string) {
    this.params.filler = value || '0xFiller'
    return this
  }

  withOfferer(value?: string) {
    this.params.offerer = value || '0xOfferer'
    return this
  }

  withOrderStatus(value?: string) {
    this.params.orderStatus = value || 'open'
    return this
  }

  withChainId(value?: number) {
    this.params.chainId = value || 1
    return this
  }

  withPair(value?: string) {
    this.params.pair = value || '0x0000000000000000000000000000000000000000-0x1111111111111111111111111111111111111111-123'
    return this
  }

  withDesc(value?: boolean) {
    if (value === undefined) {
      this.params.desc = true
    } else {
      this.params.desc = value
    }
    return this
  }

  withSortKey(value?: SORT_FIELDS) {
    this.params.sortKey = value || SORT_FIELDS.CREATED_AT
    return this
  }

  withSort(value?: string) {
    this.params.sort = value || 'desc'
    return this
  }

  public build(): GetOrdersQueryParams {
    const result = { ...this.params }
    this.params = {}
    return result
  }
}
