import { KMSClient } from '@aws-sdk/client-kms'
import { KmsSigner } from '@uniswap/signer'
import { MetricsLogger } from 'aws-embedded-metrics'
import { APIGatewayEvent, Context } from 'aws-lambda'
import { default as Logger } from 'bunyan'
import { checkDefined } from '../../preconditions/preconditions'
import { setGlobalLogger } from '../../util/log'
import { setGlobalMetrics } from '../../util/metrics'
import { ApiInjector, ApiRInj } from '../base'
import { DEFAULT_MAX_OPEN_ORDERS, HIGH_MAX_OPEN_ORDERS, HIGH_MAX_OPEN_ORDERS_SWAPPERS } from '../constants'
import { ContainerInjected as PostContainerInjected } from '../shared/post'
import { PostOrderRequestBody } from './schema'

export class PostOrderInjector extends ApiInjector<PostContainerInjected, ApiRInj, PostOrderRequestBody, void> {
  public async buildContainerInjected(): Promise<PostContainerInjected> {
    const kmsKeyId = checkDefined(process.env.KMS_KEY_ID, 'KMS_KEY_ID is not defined')
    const region = checkDefined(process.env.REGION, 'REGION is not defined')
    const cosigner = new KmsSigner(new KMSClient({ region: region }), kmsKeyId)
    const cosignerAddress = await cosigner.getAddress()

    return {
      cosignerAddress,
    }
  }

  public async getRequestInjected(
    _containerInjected: PostContainerInjected,
    _requestBody: PostOrderRequestBody,
    _requestQueryParams: void,
    _event: APIGatewayEvent,
    context: Context,
    log: Logger,
    metrics: MetricsLogger
  ): Promise<ApiRInj> {
    metrics.setNamespace('Uniswap')
    metrics.setDimensions({ Service: 'UniswapXService' })
    setGlobalMetrics(metrics)
    setGlobalLogger(log)

    return {
      requestId: context.awsRequestId,
      log,
    }
  }
}

export function getMaxOpenOrders(offerer: string): number {
  if (HIGH_MAX_OPEN_ORDERS_SWAPPERS.includes(offerer.toLowerCase())) {
    return HIGH_MAX_OPEN_ORDERS
  }

  return DEFAULT_MAX_OPEN_ORDERS
}
