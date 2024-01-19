export enum FILTER_FIELD {
  OFFERER = 'offerer',
  ORDER_STATUS = 'orderStatus',
  FILLER = 'filler',
}

export type WebhookDefinition = {
  filter: WebhookFilterMapping
  '*'?: Webhook[]
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
