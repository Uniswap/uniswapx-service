import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { checkDefined } from '../preconditions/preconditions';
import { OrderFilter, WebhookProvider } from './base'
import { FILTER_FIELD, Webhook, WebhookDefinition } from './types'

export class S3WebhookProvider implements WebhookProvider {
  private static UPDATE_ENDPOINTS_PERIOD_MS = 5 * 60000;

  private cachedDefinition: WebhookDefinition | null;
  private lastUpdatedEndpointsTimestamp: number;

  constructor(private bucket: string, private key: string) {
  this.cachedDefinition = null;
    this.lastUpdatedEndpointsTimestamp = Date.now();
  }

  // get registered endpoints for a filter set
  public async getEndpoints(filter: OrderFilter): Promise<Webhook[]> {
    let endpoints: Webhook[] = []
    const filterKeys = Object.keys(filter) as FILTER_FIELD[]
    const definition = await this.getDefinition();

    for (const filterKey of filterKeys) {
      const filterValue = filter[filterKey]
      if (filterValue && Object.keys(definition.filter[filterKey]).includes(filterValue)) {
        const registeredEndpoints = definition.filter[filterKey][filterValue]
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

  async getDefinition(): Promise<WebhookDefinition> {
  // if we already have a cached one just return it
    if (
      this.cachedDefinition !== null &&
      Date.now() - this.lastUpdatedEndpointsTimestamp < S3WebhookProvider.UPDATE_ENDPOINTS_PERIOD_MS
    ) {
    return this.cachedDefinition;
    }

    const s3Client = new S3Client({});
    const s3Res = await s3Client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: this.key,
      })
    );
    const s3Body = checkDefined(s3Res.Body, 's3Res.Body is undefined');
    this.cachedDefinition = JSON.parse(await s3Body.transformToString()) as WebhookDefinition;
      this.lastUpdatedEndpointsTimestamp = Date.now();
      return this.cachedDefinition;
  }
}
