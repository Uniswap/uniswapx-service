import { APIGatewayEvent, Context } from 'aws-lambda'
import { default as Logger } from 'bunyan'
import { ApiInjector, ApiRInj } from '../base'
import { MetricsLogger } from 'aws-embedded-metrics'
import { setGlobalLogger } from '../../util/log'
import { setGlobalMetrics } from '../../util/metrics'
import { DocumentClient } from 'aws-sdk/clients/dynamodb'
import { DynamoQuoteMetadataRepository, QuoteMetadataRepository } from '../../repositories/quote-metadata-repository'
import { DynamoUnimindParametersRepository, UnimindParametersRepository } from '../../repositories/unimind-parameters-repository'
import { UnimindQueryParams } from './schema'

export type RequestInjected = ApiRInj
export interface ContainerInjected {
  quoteMetadataRepository: QuoteMetadataRepository
  unimindParametersRepository: UnimindParametersRepository
}

export class GetUnimindInjector extends ApiInjector<ContainerInjected, RequestInjected, void, UnimindQueryParams> {
  private readonly documentClient: DocumentClient

  constructor(name: string) {
    super(name)
    this.documentClient = new DocumentClient()
  }

  public async buildContainerInjected(): Promise<ContainerInjected> {
    return {
      quoteMetadataRepository: DynamoQuoteMetadataRepository.create(this.documentClient),
      unimindParametersRepository: DynamoUnimindParametersRepository.create(this.documentClient)
    }
  }

  public async getRequestInjected(
    _containerInjected: ContainerInjected,
    _requestBody: void,
    _requestQueryParams: UnimindQueryParams,
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
