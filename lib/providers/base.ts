import { FILTER_FIELD, Webhook } from './types'

export type OrderFilter = {
  [FILTER_FIELD.OFFERER]: string
  [FILTER_FIELD.FILLER]: string
  [FILTER_FIELD.ORDER_STATUS]: string
}

export interface WebhookProvider {
  getEndpoints(filter: OrderFilter): Webhook[]
}
