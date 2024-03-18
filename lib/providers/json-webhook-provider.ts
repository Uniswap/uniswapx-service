import { OrderType } from '@uniswap/uniswapx-sdk'
import { OrderFilter, WebhookProvider } from './base'
import { FILTER_FIELD, Webhook, WebhookDefinition } from './types'

export class JsonWebhookProvider implements WebhookProvider {
  static create(jsonDocument: WebhookDefinition): JsonWebhookProvider {
    return new JsonWebhookProvider(jsonDocument)
  }

  private constructor(private readonly jsonDocument: WebhookDefinition) {}

  // get registered endpoints for a filter set
  public async getEndpoints(filter: OrderFilter): Promise<Webhook[]> {
    return findEndpointsMatchingFilter(filter, this.jsonDocument)
  }
}

export function findEndpointsMatchingFilter(filter: OrderFilter, definition: WebhookDefinition): Webhook[] {
  const endpoints: Webhook[] = []

  const catchallEndpoints = definition['*'] ?? []
  endpoints.push(...catchallEndpoints)

  // remove limit orders and dutch_v2 orders when matching webhooks
  // webhook is currently used only to fill dutch orders
  if (filter.orderType !== OrderType.Limit && filter.orderType !== OrderType.Dutch_V2) {
    const supportedFilterKeys: (FILTER_FIELD.FILLER | FILTER_FIELD.OFFERER | FILTER_FIELD.ORDER_STATUS)[] = [
      FILTER_FIELD.FILLER,
      FILTER_FIELD.ORDER_STATUS,
      FILTER_FIELD.OFFERER,
    ]
    const filterMapping = definition.filter
    for (const filterKey of supportedFilterKeys) {
      const filterValue = filter[filterKey]
      if (filterValue && Object.keys(filterMapping[filterKey]).includes(filterValue)) {
        const filterEndpoints = filterMapping[filterKey][filterValue]
        endpoints.push(...filterEndpoints)
      }
    }
  }

  const urls: Set<string> = new Set()
  return endpoints.filter((endpoint) => {
    if (urls.has(endpoint.url)) {
      return false
    }
    urls.add(endpoint.url)
    return true
  })
}
