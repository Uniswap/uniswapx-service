import { FILTER_FIELD, WebhookDefinition } from '../entities/Webhook'

export type OrderFilter = {
  [FILTER_FIELD.OFFERER]: string
  [FILTER_FIELD.FILLER]: string
  [FILTER_FIELD.ORDER_STATUS]: string
  [FILTER_FIELD.SELL_TOKEN]: string
}

export interface WebhookProvider {
  getEndpoints(filter: OrderFilter): Set<string>
}

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
      if (Object.keys(filterMapping[filterKey]).includes(filter[filterKey])) {
        endpoints = endpoints.concat(filterMapping[filterKey][filter[filterKey]])
      }
    }

    return new Set(endpoints)
  }
}
