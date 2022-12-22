import { FILTER_FIELD } from './types'

export type OrderFilter = {
  [FILTER_FIELD.OFFERER]: string
  [FILTER_FIELD.FILLER]: string
  [FILTER_FIELD.ORDER_STATUS]: string
  [FILTER_FIELD.SELL_TOKEN]: string
}

export interface WebhookProvider {
  getEndpoints(filter: OrderFilter): Set<string>
}
