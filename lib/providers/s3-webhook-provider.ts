import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { checkDefined } from '../preconditions/preconditions'
import { OrderFilter, WebhookProvider } from './base'
import { findEndpointsMatchingFilter } from './json-webhook-provider'
import { FILTER_FIELD, Webhook, WebhookDefinition } from './types'

export class S3WebhookConfigurationProvider implements WebhookProvider {
  private static UPDATE_ENDPOINTS_PERIOD_MS = 5 * 60000

  private cachedDefinition: WebhookDefinition | null
  private lastUpdatedEndpointsTimestamp: number

  constructor(private bucket: string, private key: string) {
    this.cachedDefinition = null
    this.lastUpdatedEndpointsTimestamp = Date.now()
  }

  // get registered endpoints for a filter set
  public async getEndpoints(filter: OrderFilter): Promise<Webhook[]> {
    const definition = await this.getDefinition()
    return findEndpointsMatchingFilter(filter, definition)
  }

  public async getExclusiveFillerEndpoints(filler: string): Promise<Webhook[]> {
    const definition = await this.getDefinition()
    return definition.filter[FILTER_FIELD.FILLER][filler] ?? []
  }

  async getDefinition(): Promise<WebhookDefinition> {
    // if we already have a cached one just return it
    if (
      this.cachedDefinition !== null &&
      Date.now() - this.lastUpdatedEndpointsTimestamp < S3WebhookConfigurationProvider.UPDATE_ENDPOINTS_PERIOD_MS
    ) {
      return this.cachedDefinition
    }

    const s3Client = new S3Client({})
    const s3Res = await s3Client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: this.key,
      })
    )
    const s3Body = checkDefined(s3Res.Body, 's3Res.Body is undefined')
    this.cachedDefinition = JSON.parse(await s3Body.transformToString()) as WebhookDefinition
    this.lastUpdatedEndpointsTimestamp = Date.now()
    return this.cachedDefinition
  }
}
