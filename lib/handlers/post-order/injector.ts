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
import { PostOrderRequestBody } from './schema'

interface Cosigner {
  signDigest(digest: Buffer | string): Promise<string>
}

export interface ContainerInjected {
  cosigner?: Cosigner
  cosignerAddress?: string
}

export class PostOrderInjector extends ApiInjector<ContainerInjected, ApiRInj, PostOrderRequestBody, void> {
  public async buildContainerInjected(): Promise<ContainerInjected> {
    const kmsKeyId = checkDefined(process.env.KMS_KEY_ID, 'KMS_KEY_ID is not defined')
    const awsRegion = checkDefined(process.env.REGION, 'REGION is not defined')
    const cosigner = new KmsSigner(new KMSClient({ region: awsRegion }), kmsKeyId)
    const cosignerAddress = await cosigner.getAddress()
    checkDefined(cosignerAddress, 'Cosigner address is not defined')

    return {
      cosigner,
      cosignerAddress,
    }
  }

  public async getRequestInjected(
    _containerInjected: unknown,
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
