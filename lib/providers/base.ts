import { FILTER_FIELD, Webhook } from './types'

export type OrderFilter = {
  [FILTER_FIELD.OFFERER]: string
  [FILTER_FIELD.ORDER_STATUS]: string
  [FILTER_FIELD.FILLER]?: string
  [FILTER_FIELD.ORDER_TYPE]?: string
}

export interface WebhookProvider {
  getEndpoints(filter: OrderFilter): Promise<Webhook[]>
}
