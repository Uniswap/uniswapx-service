import { Unit } from 'aws-embedded-metrics'
import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda'
import Joi from 'joi'
import { metrics } from '../../util/metrics'
import { APIGLambdaHandler, APIHandleRequestParams, ErrorCode, ErrorResponse, Response } from '../base/index'
import { ContainerInjected, RequestInjected } from './injector'
import { GetNonceQueryParams, GetNonceQueryParamsJoi, GetNonceResponse, GetNonceResponseJoi } from './schema/index'

export class GetNonceHandler extends APIGLambdaHandler<
  ContainerInjected,
  RequestInjected,
  void,
  GetNonceQueryParams,
  GetNonceResponse
> {
  public async handleRequest(
    params: APIHandleRequestParams<ContainerInjected, RequestInjected, void, GetNonceQueryParams>
  ): Promise<ErrorResponse | Response<GetNonceResponse>> {
    const {
      requestInjected: { address, chainId, log },
      containerInjected: { dbInterface },
    } = params

    try {
      log.info({ address: address }, 'Getting nonce for address')
      const nonce = await dbInterface.getNonceByAddressAndChain(address.toLowerCase(), chainId)
      return {
        statusCode: 200,
        body: {
          nonce: nonce,
        },
      }
    } catch (e: unknown) {
      log.error({ e }, `Error getting nonce for address ${address} on chain ${chainId}`)
      return {
        statusCode: 500,
        errorCode: ErrorCode.InternalError,
        ...(e instanceof Error && { detail: e.message }),
      }
    }
  }

  protected afterResponseHook(event: APIGatewayProxyEvent, _context: Context, response: APIGatewayProxyResult): void {
    const { statusCode } = response

    // Try and extract the chain id from the raw json.
    let chainId = '0'
    try {
      chainId = event.queryStringParameters?.chainId ?? '0'
    } catch (err) {
      // no-op. If we can't get chainId still log the metric as chain 0
    }

    const statusCodeMod = (Math.floor(statusCode / 100) * 100).toString().replace(/0/g, 'X')

    const getNonceStatusByChain = `GetNonceChainId${chainId.toString()}Status${statusCodeMod}`
    metrics.putMetric(getNonceStatusByChain, 1, Unit.Count)

    const getNonceStatus = `GetNonceStatus${statusCodeMod}`
    metrics.putMetric(getNonceStatus, 1, Unit.Count)

    const getNonceChainId = `GetNonceRequestChainId${chainId.toString()}`
    metrics.putMetric(getNonceChainId, 1, Unit.Count)

    const getNonce = `GetNonceRequest`
    metrics.putMetric(getNonce, 1, Unit.Count)
  }

  protected requestBodySchema(): Joi.ObjectSchema | null {
    return null
  }

  protected requestQueryParamsSchema(): Joi.ObjectSchema | null {
    return GetNonceQueryParamsJoi
  }

  protected responseBodySchema(): Joi.ObjectSchema | null {
    return GetNonceResponseJoi
  }
}
