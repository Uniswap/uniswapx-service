import { metricScope, MetricsLogger } from 'aws-embedded-metrics'
import { APIGatewayProxyEvent, Context } from 'aws-lambda'
import { DocumentClient } from 'aws-sdk/clients/dynamodb'
import axios from 'axios'
import { WebhookProvider } from '../../../lib/providers/base'
import { Webhook } from '../../../lib/providers/types'
import { TABLE_NAMES } from '../../../lib/repositories/util'
import { NullMetrics, setGlobalMetrics } from '../../../lib/util/metrics'
import { DYNAMO_LOCAL_CONFIG } from '../dynamo-local'

export const documentClient = new DocumentClient(DYNAMO_LOCAL_CONFIG)

// What the contract suites compare responses on: the status and the parsed body. Headers are the
// same on every API Gateway response and are pinned once in the post suite.
export type HttpResult = { statusCode: number; body: unknown }

export function httpResult(response: { statusCode: number; body: string }): HttpResult {
  return { statusCode: response.statusCode, body: JSON.parse(response.body) }
}

export const LAMBDA_CONTEXT = { awsRequestId: 'testRequest' } as unknown as Context

export function postEvent(body: unknown): APIGatewayProxyEvent {
  return {
    body: typeof body === 'string' ? body : JSON.stringify(body),
    queryStringParameters: null,
  } as unknown as APIGatewayProxyEvent
}

export function getEvent(queryStringParameters: Record<string, string> | null): APIGatewayProxyEvent {
  return { body: null, queryStringParameters } as unknown as APIGatewayProxyEvent
}

// A metric as putMetric received it: [name, value, unit].
export type MetricCall = [string, number, string | undefined]

// One request's aws-embedded-metrics logger: the one metricScope hands the handler.
export class RecordingMetricsLogger {
  public readonly calls: MetricCall[] = []

  putMetric(key: string, value: number, unit?: string): void {
    this.calls.push([key, value, unit])
  }

  // Emission order is an implementation detail (the exclusive-filler notice runs concurrently).
  sorted(): MetricCall[] {
    return [...this.calls].sort(([a], [b]) => a.localeCompare(b))
  }

  /* eslint-disable @typescript-eslint/no-empty-function */
  setNamespace(): void {}
  setDimensions(): void {}
  putDimensions(): void {}
  setProperty(): void {}
  async flush(): Promise<void> {}
  /* eslint-enable @typescript-eslint/no-empty-function */
}

/**
 * Hands every request its own RecordingMetricsLogger, as metricScope does in the Lambda, and
 * returns them in request order. Resets the global metrics logger to a no-op, as on a cold start.
 */
export function recordMetricScopes(): RecordingMetricsLogger[] {
  const scopes: RecordingMetricsLogger[] = []
  setGlobalMetrics(new NullMetrics())
  jest.mocked(metricScope).mockImplementation(((handler: (metrics: MetricsLogger) => unknown) => {
    const scope = new RecordingMetricsLogger()
    scopes.push(scope)
    return handler(scope as unknown as MetricsLogger)
  }) as typeof metricScope)
  return scopes
}

// The one webhook every exclusive filler is registered at in these suites.
export const EXCLUSIVE_FILLER_WEBHOOK: Webhook = {
  url: 'https://filler.example/uniswapx/orders',
  headers: { 'x-api-key': 'test-key' },
}

// An axios.post the immediate exclusive-filler notice made: [url, body, config].
export type NoticeCall = [string, unknown, unknown]

// Answers every exclusive filler with EXCLUSIVE_FILLER_WEBHOOK and records the notices sent to it.
export class RecordingWebhookProvider implements WebhookProvider {
  public readonly notices: NoticeCall[] = []
  private readonly post: jest.SpyInstance

  constructor() {
    this.post = jest.spyOn(axios, 'post').mockImplementation(async (url, body, config) => {
      this.notices.push([url, body, config])
      return { status: 200, data: {} }
    })
  }

  restore(): void {
    this.post.mockRestore()
  }

  async getEndpoints(): Promise<Webhook[]> {
    throw new Error('RecordingWebhookProvider.getEndpoints is not on the post path')
  }

  async getExclusiveFillerEndpoints(): Promise<Webhook[]> {
    return [EXCLUSIVE_FILLER_WEBHOOK]
  }
}

// Lets fire-and-forget work started by the last request (the immediate notice) finish.
export async function settle(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve))
}

// The item exactly as DynamoDB holds it, including dynamodb-toolbox's _et/_ct/_md.
export async function rawItem(
  tableName: TABLE_NAMES,
  key: Record<string, string>
): Promise<DocumentClient.AttributeMap | undefined> {
  const { Item } = await documentClient.get({ TableName: tableName, Key: key }).promise()
  return Item
}

export async function putRawItems(tableName: TABLE_NAMES, items: DocumentClient.PutItemInputAttributeMap[]) {
  for (const item of items) {
    await documentClient.put({ TableName: tableName, Item: item }).promise()
  }
}

export async function deleteRawItems(tableName: TABLE_NAMES, keys: Record<string, string>[]): Promise<void> {
  for (const key of keys) {
    await documentClient.delete({ TableName: tableName, Key: key }).promise()
  }
}

// The keys among `keys` that still have an item in `tableName`.
export async function leftoverKeys(tableName: TABLE_NAMES, keys: Record<string, string>[]) {
  const leftovers: Record<string, string>[] = []
  for (const key of keys) {
    if (await rawItem(tableName, key)) {
      leftovers.push(key)
    }
  }
  return leftovers
}
