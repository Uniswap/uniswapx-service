import { MetricsLogger } from 'aws-embedded-metrics'
import { DynamoDBStreamEvent } from 'aws-lambda'
import { default as bunyan, default as Logger } from 'bunyan'
import { checkDefined } from '../../preconditions/preconditions'
import { WebhookProvider } from '../../providers/base'
import { S3WebhookConfigurationProvider } from '../../providers/s3-webhook-provider'
import { BETA_WEBHOOK_CONFIG_KEY, PRODUCTION_WEBHOOK_CONFIG_KEY, WEBHOOK_CONFIG_BUCKET } from '../../util/constants'
import { setGlobalLogger } from '../../util/log'
import { setGlobalMetrics } from '../../util/metrics'
import { STAGE } from '../../util/stage'
import { DynamoStreamInjector } from '../base/dynamo-stream-handler'

export interface RequestInjected {
  log: Logger
  event: DynamoDBStreamEvent
}

export interface ContainerInjected {
  webhookProvider: WebhookProvider
}

export class OrderNotificationInjector extends DynamoStreamInjector<ContainerInjected, RequestInjected> {
  public async buildContainerInjected(): Promise<ContainerInjected> {
    const stage = checkDefined(process.env['stage'], 'stage should be defined in the .env')
    const s3Key = stage === STAGE.BETA ? BETA_WEBHOOK_CONFIG_KEY : PRODUCTION_WEBHOOK_CONFIG_KEY
    const webhookProvider = new S3WebhookConfigurationProvider(`${WEBHOOK_CONFIG_BUCKET}-${stage}-1`, s3Key)
    return { webhookProvider }
  }

  public async getRequestInjected(
    containerInjected: ContainerInjected,
    event: DynamoDBStreamEvent,
    log: Logger,
    metrics: MetricsLogger
  ): Promise<RequestInjected> {
    log = log.child({
      serializers: bunyan.stdSerializers,
      containerInjected: containerInjected,
    })
    metrics.setNamespace('Uniswap')
    metrics.setDimensions({ Service: 'UniswapXService' })
    setGlobalMetrics(metrics)
    setGlobalLogger(log)

    return {
      log,
      event: event,
    }
  }
}
