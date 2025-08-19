/**
 * Canonical webhook order data structure
 * This is the standardized format for all webhook notifications
 */
export interface WebhookOrderData {
  orderHash: string
  createdAt: number
  signature: string
  offerer: string // Standardized field name used in webhook payloads
  orderStatus: string
  encodedOrder: string
  chainId: number
  orderType?: string
  quoteId?: string
  filler?: string
}

/**
 * Webhook order data for exclusive filler notifications
 * Guarantees that filler field is present and non-null
 */
export type ExclusiveFillerWebhookOrder = WebhookOrderData & {
  filler: string
}

/**
 * Logger interface for webhook operations
 */
export interface WebhookLogger {
  info: (obj: any, msg: string) => void
  warn: (obj: any, msg: string) => void
  error: (obj: any, msg: string) => void
}

/**
 * Webhook provider interface
 */
export interface WebhookProviderInterface {
  getEndpoints: (filter: {
    offerer: string
    orderStatus: string
    filler?: string
    orderType?: string
  }) => Promise<Array<{ url: string; headers?: { [key: string]: string } }>>
  getExclusiveFillerEndpoints: (filler: string) => Promise<Array<{ url: string; headers?: { [key: string]: string } }>>
}
