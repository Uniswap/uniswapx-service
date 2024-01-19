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
  let endpoints: Webhook[] = definition['*'] ?? []

  const filterKeys = Object.keys(filter) as FILTER_FIELD[]
  const filterMapping = definition.filter

  for (const filterKey of filterKeys) {
    const filterValue = filter[filterKey]
    if (filterValue && Object.keys(filterMapping[filterKey]).includes(filterValue)) {
      const registeredEndpoints = filterMapping[filterKey][filterValue]
      endpoints = endpoints.concat(registeredEndpoints)
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
