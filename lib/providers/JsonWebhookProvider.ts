import { FILTER_FIELD, WebhookDefinition } from '../entities/Webhook'
import { OrderFilter, WebhookProvider } from './base'

export class JsonWebhookProvider implements WebhookProvider {
  static create(jsonDocument: WebhookDefinition): JsonWebhookProvider {
    return new JsonWebhookProvider(jsonDocument)
  }

  private constructor(private readonly jsonDocument: WebhookDefinition) {}

  // get registered endpoints for a filter set
  public getEndpoints(filter: OrderFilter): Set<string> {
    let endpoints: string[] = []
    const filterKeys = Object.keys(filter) as FILTER_FIELD[]
    const filterMapping = this.jsonDocument.filter

    for (const filterKey of filterKeys) {
      const filterValue = filter[filterKey]
      if (Object.keys(filterMapping[filterKey]).includes(filterValue)) {
        const registeredEndpoints = filterMapping[filterKey][filterValue]
        endpoints = endpoints.concat(registeredEndpoints)
      }
    }

    return new Set(endpoints)
  }
}
