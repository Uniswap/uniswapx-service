import { OrderFilter } from './base'
import { FILTER_FIELD, Webhook, WebhookDefinition } from './types'

export function findEndpointsMatchingFilter(filter: OrderFilter, definition: WebhookDefinition): Webhook[] {
  const endpoints: Webhook[] = []

  const catchallEndpoints = definition['*'] ?? []
  endpoints.push(...catchallEndpoints)

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

  const urls: Set<string> = new Set()
  return endpoints.filter((endpoint) => {
    if (urls.has(endpoint.url)) {
      return false
    }
    urls.add(endpoint.url)
    return true
  })
}
