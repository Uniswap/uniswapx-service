import { metricScope, MetricsLogger } from 'aws-embedded-metrics'
import {
  APIGatewayProxyEvent,
  APIGatewayProxyEventQueryStringParameters,
  APIGatewayProxyResult,
  Context,
} from 'aws-lambda'

import { default as bunyan, default as Logger } from 'bunyan'
import Joi from 'joi'
import { setGlobalMetrics } from '../../util/metrics'
import { ErrorCode } from './ErrorCode'
import { buildRequestContext, emitRequestMetrics, RequestContext, RequestMetricsConfig } from './request-context'
export const INTERNAL_ERROR = (id?: string) => {
  return {
    statusCode: 500,
    body: JSON.stringify({
      errorCode: ErrorCode.InternalError,
      detail: 'Unexpected error',
      id,
    }),
  }
}

export type APIGatewayProxyHandler = (event: APIGatewayProxyEvent, context: Context) => Promise<APIGatewayProxyResult>

/*
 * The raw APIGatewayProxyEvent carries the client IP in several places: requestContext.identity.sourceIp
 * and any of the forwarding headers (X-Forwarded-For, X-Real-IP, CF-Connecting-IP, ...). IP addresses are
 * personal data, and our log groups retain for up to three months, so never log the raw event.
 * This is an allowlist rather than a denylist so a new IP-bearing header can't leak in by default.
 */
export function redactEvent(event: APIGatewayProxyEvent) {
  return {
    resource: event.resource,
    path: event.path,
    httpMethod: event.httpMethod,
    pathParameters: event.pathParameters,
    queryStringParameters: event.queryStringParameters,
    body: event.body,
    isBase64Encoded: event.isBase64Encoded,
    requestContext: {
      requestId: event.requestContext?.requestId,
      path: event.requestContext?.path,
      stage: event.requestContext?.stage,
      resourcePath: event.requestContext?.resourcePath,
      httpMethod: event.requestContext?.httpMethod,
      requestTimeEpoch: event.requestContext?.requestTimeEpoch,
    },
  }
}

export type ApiRInj = {
  log: Logger
  requestId: string
}

export type APIHandleRequestParams<RInj, ReqBody, ReqQueryParams> = {
  context: Context
  event: APIGatewayProxyEvent
  requestBody: ReqBody
  requestQueryParams: ReqQueryParams
  requestInjected: RInj
  ctx: RequestContext
}

export type Response<Res> = {
  statusCode: 200 | 201 | 202
  body: Res
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  headers?: any
}

export type ErrorResponse = {
  statusCode: 400 | 403 | 404 | 408 | 409 | 500
  errorCode?: ErrorCode
  detail?: string
}

/**
 * An API Gateway Lambda handler. Its dependencies come through the subclass constructor, built
 * once per Lambda in its index.ts; per request it validates the event, builds the handler's
 * request values (buildRequestInjected), handles the request and validates the response.
 */
export abstract class APIGLambdaHandler<RInj extends ApiRInj, ReqBody, ReqQueryParams, Res> {
  constructor(protected readonly handlerName: string) {}

  get handler(): APIGatewayProxyHandler {
    return async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
      const handler = this.buildHandler()

      const response = await handler(event, context)
      const existingHeaders = response.headers ?? { 'Content-Type': 'application/json' }

      return {
        ...response,
        headers: {
          ...existingHeaders,
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
          'Access-Control-Allow-Credentials': true,
        },
      }
    }
  }

  protected buildHandler(): APIGatewayProxyHandler {
    return metricScope((metrics: MetricsLogger) => {
      const handle = async (
        event: APIGatewayProxyEvent,
        context: Context,
        ctx: RequestContext
      ): Promise<APIGatewayProxyResult> => {
        let log: Logger = bunyan.createLogger({
          name: this.handlerName,
          serializers: bunyan.stdSerializers,
          level: process.env.NODE_ENV == 'test' ? bunyan.FATAL + 1 :
            process.env.NODE_ENV == 'debug' ? bunyan.DEBUG : bunyan.INFO,
          requestId: context.awsRequestId,
        })

        log.debug({ event: redactEvent(event), context }, 'Request started.')

        let requestBody: ReqBody
        let requestQueryParams: ReqQueryParams
        try {
          const requestValidation = await this.parseAndValidateRequest(event, log)

          if (requestValidation.state == 'invalid') {
            return requestValidation.errorResponse
          }

          requestBody = requestValidation.requestBody
          requestQueryParams = requestValidation.requestQueryParams
        } catch (err) {
          log.error({ err }, 'Unexpected error validating request')
          return INTERNAL_ERROR()
        }

        let requestInjected: RInj
        try {
          requestInjected = this.buildRequestInjected(
            { requestId: context.awsRequestId, log },
            requestBody,
            requestQueryParams
          )
        } catch (err) {
          log.error({ err, event: redactEvent(event) }, 'Unexpected error building request injected.')
          return INTERNAL_ERROR()
        }

        const { requestId: id } = requestInjected
        log = requestInjected.log

        let headers: { [key: string]: string }
        let statusCode: number
        let body: Res

        try {
          const handleRequestResult = await this.handleRequest({
            context,
            event,
            requestBody,
            requestQueryParams,
            requestInjected,
            ctx,
          })

          if (this.isError(handleRequestResult)) {
            log.info({ handleRequestResult }, 'Handler did not return a 200')
            const { statusCode, detail, errorCode } = handleRequestResult
            const response = JSON.stringify({ detail, errorCode, id })

            log.info({ statusCode, response }, `Request ended. ${statusCode}`)
            return {
              statusCode,
              body: response,
            }
          } else {
            log.debug({ requestQueryParams }, 'Handler returned 200')
            ;({ headers, body, statusCode } = handleRequestResult)
          }
        } catch (err) {
          log.error({ err }, 'Unexpected error in handler')
          return INTERNAL_ERROR(id)
        }

        let response: Res
        try {
          const responseValidation = await this.parseAndValidateResponse(body, id, log)

          if (responseValidation.state == 'invalid') {
            return responseValidation.errorResponse
          }

          response = responseValidation.response
        } catch (err) {
          log.error({ err }, 'Unexpected error validating response')
          return INTERNAL_ERROR(id)
        }

        log.debug({ statusCode, response }, `Request ended. ${statusCode}`)
        const responseBody =
          headers && Object.keys(headers).includes('Content-Type') && headers['Content-Type'] == 'text/html'
            ? (response as string)
            : JSON.stringify(response)
        return {
          statusCode,
          headers,
          body: responseBody,
        }
      }

      return async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
        // Built before validation so that a request rejected there still records on its own metrics
        // logger, under the namespace and dimensions the alarms read.
        const ctx = buildRequestContext(context.awsRequestId, metrics)
        // For code not yet handed ctx (query cache, nonce handler, the immediate exclusive-filler notice).
        setGlobalMetrics(metrics)

        const response = await handle(event, context, ctx)

        const requestMetrics = this.requestMetricsConfig()
        if (requestMetrics) {
          emitRequestMetrics(ctx.metrics, requestMetrics, event, response.statusCode)
        }

        return response
      }
    })
  }

  public abstract handleRequest(
    params: APIHandleRequestParams<RInj, ReqBody, ReqQueryParams>
  ): Promise<Response<Res> | ErrorResponse>

  /*
   * The handler's own per-request values, from the validated request, on top of the request's id
   * and logger. Runs after validation; a throw here is a 500.
   */
  protected abstract buildRequestInjected(
    base: ApiRInj,
    requestBody: ReqBody,
    requestQueryParams: ReqQueryParams
  ): RInj

  protected abstract requestBodySchema(): Joi.ObjectSchema | null
  protected abstract requestQueryParamsSchema(): Joi.ObjectSchema | null
  protected abstract responseBodySchema(): Joi.Schema | null

  /*
   * The request counters recorded once a response has been generated, whatever produced it
   * (including validation, which runs before buildRequestInjected). None by default.
   */
  protected requestMetricsConfig(): RequestMetricsConfig | null {
    return null
  }

  private isError(result: Response<Res> | ErrorResponse): result is ErrorResponse {
    return result.statusCode < 200 || result.statusCode > 202
  }

  private async parseAndValidateRequest(
    event: APIGatewayProxyEvent,
    log: Logger
  ): Promise<
    | {
        state: 'valid'
        requestBody: ReqBody
        requestQueryParams: ReqQueryParams
      }
    | { state: 'invalid'; errorResponse: APIGatewayProxyResult }
  > {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    let bodyRaw: any

    if (event.body) {
      try {
        bodyRaw = JSON.parse(event.body)
      } catch (err) {
        return {
          state: 'invalid',
          errorResponse: {
            statusCode: 422,
            body: JSON.stringify({
              detail: 'Invalid JSON body',
              errorCode: ErrorCode.ValidationError,
            }),
          },
        }
      }
    }

    // No query string at all is validated as an empty one, so the schema rejects what it requires.
    const queryParamsRaw: APIGatewayProxyEventQueryStringParameters = event.queryStringParameters ?? {}
    const queryParamsSchema = this.requestQueryParamsSchema()

    let queryParams: ReqQueryParams | undefined
    if (queryParamsSchema) {
      const queryParamsValidation = queryParamsSchema.validate(queryParamsRaw, {
        allowUnknown: true, // Makes API schema changes and rollbacks easier.
        stripUnknown: true,
      })

      if (queryParamsValidation.error) {
        log.info({ queryParamsValidation }, 'Request failed validation')
        return {
          state: 'invalid',
          errorResponse: {
            statusCode: 400,
            body: JSON.stringify({
              detail: queryParamsValidation.error.message,
              errorCode: ErrorCode.ValidationError,
            }),
          },
        }
      }

      queryParams = queryParamsValidation.value as ReqQueryParams
    }

    const bodySchema = this.requestBodySchema()

    let body: ReqBody | undefined
    if (bodyRaw && bodySchema) {
      const bodyValidation = bodySchema.validate(bodyRaw, {
        allowUnknown: true, // Makes API schema changes and rollbacks easier.
        stripUnknown: true,
      })

      if (bodyValidation.error) {
        // The message only: the body holds the order's signature.
        log.info({ detail: bodyValidation.error.message }, 'Request failed validation')
        return {
          state: 'invalid',
          errorResponse: {
            statusCode: 400,
            body: JSON.stringify({
              detail: bodyValidation.error.message,
              errorCode: ErrorCode.ValidationError,
            }),
          },
        }
      }

      body = bodyValidation.value
    }

    return {
      state: 'valid',
      requestBody: body as ReqBody,
      requestQueryParams: queryParams as ReqQueryParams,
    }
  }

  private async parseAndValidateResponse(
    body: Res,
    id: string,
    log: Logger
  ): Promise<{ state: 'valid'; response: Res } | { state: 'invalid'; errorResponse: APIGatewayProxyResult }> {
    const responseSchema = this.responseBodySchema()

    if (!responseSchema) {
      return { state: 'valid', response: body as Res }
    }
    const res = responseSchema.validate(body, {
      allowUnknown: true,
      stripUnknown: true, // Ensure no unexpected fields returned to users.
    })

    if (res.error) {
      log.error(
        { error: res.error?.details, errors: res.error?.details, body },
        'Unexpected error. Response failed validation.'
      )
      return {
        state: 'invalid',
        errorResponse: INTERNAL_ERROR(id),
      }
    }

    return { state: 'valid', response: res.value as Res }
  }
}
