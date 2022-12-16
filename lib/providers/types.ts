export enum FILTER_FIELD {
  OFFERER = 'offerer',
  SELL_TOKEN = 'sellToken',
  ORDER_STATUS = 'orderStatus',
  FILLER = 'filler',
}

export type WebhookDefinition = {
  filter: WebhookFilterMapping
  registeredWebhook: { [key: string]: string }
}

export type WebhookFilterMapping = {
  [FILTER_FIELD.OFFERER]: { [key: string]: string[] }
  [FILTER_FIELD.FILLER]: { [key: string]: string[] }
  [FILTER_FIELD.ORDER_STATUS]: { [key: string]: string[] }
  [FILTER_FIELD.SELL_TOKEN]: { [key: string]: string[] }
}
