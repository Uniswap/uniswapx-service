export enum FILTER_FIELD {
  OFFERER = 'swapper',
  ORDER_STATUS = 'orderStatus',
  FILLER = 'filler',
}

export type WebhookDefinition = {
  filter: WebhookFilterMapping
  registeredWebhook: { [key: string]: string }
}

export type Webhook = {
  url: string
  headers?: { [key: string]: string }
}

export type WebhookFilterMapping = {
  [FILTER_FIELD.OFFERER]: { [key: string]: Webhook[] }
  [FILTER_FIELD.FILLER]: { [key: string]: Webhook[] }
  [FILTER_FIELD.ORDER_STATUS]: { [key: string]: Webhook[] }
}
