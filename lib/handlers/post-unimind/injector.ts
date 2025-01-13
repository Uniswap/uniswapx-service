import { APIGatewayEvent, Context } from 'aws-lambda'
import { default as Logger } from 'bunyan'
import { ApiInjector, ApiRInj } from '../base'
import { MetricsLogger } from 'aws-embedded-metrics'
import { setGlobalLogger } from '../../util/log'
import { setGlobalMetrics } from '../../util/metrics'
import { DocumentClient } from 'aws-sdk/clients/dynamodb'
import { DynamoExtrinsicValuesRepository, ExtrinsicValuesRepository, ExtrinsicValues } from '../../repositories/extrinsic-values-repository'

export type RequestInjected = ApiRInj
export interface ContainerInjected {
  extrinsicValuesRepository: ExtrinsicValuesRepository
}

export class PostUnimindInjector extends ApiInjector<ContainerInjected, RequestInjected, ExtrinsicValues, void> {
  private readonly documentClient: DocumentClient

  constructor(name: string) {
    super(name)
    this.documentClient = new DocumentClient()
  }

  public async buildContainerInjected(): Promise<ContainerInjected> {
    return {
      extrinsicValuesRepository: DynamoExtrinsicValuesRepository.create(this.documentClient)
    }
  }

  public async getRequestInjected(
    _containerInjected: ContainerInjected,
    _requestBody: ExtrinsicValues,
    _requestQueryParams: void,
    _event: APIGatewayEvent,
    context: Context,
    log: Logger,
    metrics: MetricsLogger
  ): Promise<RequestInjected> {
    metrics.setNamespace('Uniswap')
    metrics.setDimensions({ Service: 'UniswapXService' })
    setGlobalMetrics(metrics)
    setGlobalLogger(log)
    return { requestId: context.awsRequestId, log }
  }
}
