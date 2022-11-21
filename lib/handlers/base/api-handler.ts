import {
  APIGatewayProxyEvent,
  APIGatewayProxyEventQueryStringParameters,
  APIGatewayProxyResult,
  Context,
} from 'aws-lambda'
import { default as bunyan, default as Logger } from 'bunyan'
import Joi from 'joi'
import { BaseHandleRequestParams, BaseInjector, BaseLambdaHandler, BaseRInj } from './base'

const INTERNAL_ERROR = (id?: string) => {
  return {
    statusCode: 500,
    body: JSON.stringify({
      errorCode: 'INTERNAL_ERROR',
      detail: 'Unexpected error',
      id,
    }),
  }
}

export type APIGatewayProxyHandler = (event: APIGatewayProxyEvent, context: Context) => Promise<APIGatewayProxyResult>

export type ApiRInj = BaseRInj & { requestId: string }

export type APIHandleRequestParams<CInj, RInj, ReqBody, ReqQueryParams> = BaseHandleRequestParams<
  CInj,
  APIGatewayProxyEvent
> & {
  context: Context
  event: APIGatewayProxyEvent
  requestBody: ReqBody
  requestQueryParams: ReqQueryParams
  containerInjected: CInj
  requestInjected: RInj
}

export type Response<Res> = {
  statusCode: 200 | 201 | 202
  body: Res
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  headers?: any
}

export type ErrorResponse = {
  statusCode: 400 | 403 | 404 | 408 | 409 | 500
  errorCode?: string
  detail?: string
}

export abstract class ApiInjector<CInj, RInj extends ApiRInj, ReqBody, ReqQueryParams> extends BaseInjector<CInj> {
  public constructor(protected injectorName: string) {
    super(injectorName)
  }

  public abstract getRequestInjected(
    containerInjected: CInj,
    requestBody: ReqBody,
    requestQueryParams: ReqQueryParams,
    event: APIGatewayProxyEvent,
    context: Context,
    log: Logger
  ): Promise<RInj>
}

export abstract class APIGLambdaHandler<
  CInj,
  RInj extends ApiRInj,
  ReqBody,
  ReqQueryParams,
  Res
> extends BaseLambdaHandler<
  APIGatewayProxyHandler,
  APIHandleRequestParams<CInj, RInj, ReqBody, ReqQueryParams>,
  Response<Res> | ErrorResponse
> {
  constructor(
    handlerName: string,
    private readonly injectorPromise: Promise<ApiInjector<CInj, RInj, ReqBody, ReqQueryParams>>
  ) {
    super(handlerName)
  }

  get handler(): APIGatewayProxyHandler {
    return async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
      const handler = this.buildHandler()

      const response = await handler(event, context)

      return {
        ...response,
        headers: {
          ...response.headers,
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
          'Access-Control-Allow-Credentials': true,
          'Content-Type': 'application/json',
        },
      }
    }
  }

  protected buildHandler(): APIGatewayProxyHandler {
    return async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
      let log: Logger = bunyan.createLogger({
        name: this.handlerName,
        serializers: bunyan.stdSerializers,
        level: process.env.NODE_ENV == 'test' ? bunyan.FATAL + 1 : bunyan.INFO,
        requestId: context.awsRequestId,
      })

      log.info({ event, context }, 'Request started.')

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

      const injector = await this.injectorPromise

      const containerInjected = injector.getContainerInjected()

      let requestInjected: RInj
      try {
        requestInjected = await injector.getRequestInjected(
          containerInjected,
          requestBody,
          requestQueryParams,
          event,
          context,
          log
        )
      } catch (err) {
        log.error({ err, event }, 'Unexpected error building request injected.')
        return INTERNAL_ERROR()
      }

      const { requestId: id } = requestInjected

      ;({ log } = requestInjected)

      let statusCode: number
      let body: Res

      try {
        const handleRequestResult = await this.handleRequest({
          context,
          event,
          requestBody,
          requestQueryParams,
          containerInjected,
          requestInjected,
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
          log.info({ requestBody, requestQueryParams }, 'Handler returned 200')
          ;({ body, statusCode } = handleRequestResult)
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

      log.info({ statusCode, response }, `Request ended. ${statusCode}`)
      return {
        statusCode,
        body: JSON.stringify(response),
      }
    }
  }

  public abstract handleRequest(
    params: APIHandleRequestParams<CInj, RInj, ReqBody, ReqQueryParams>
  ): Promise<Response<Res> | ErrorResponse>

  protected abstract requestBodySchema(): Joi.ObjectSchema | null
  protected abstract requestQueryParamsSchema(): Joi.ObjectSchema | null
  protected abstract responseBodySchema(): Joi.ObjectSchema | null

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
              errorCode: 'VALIDATION_ERROR',
            }),
          },
        }
      }
    }

    const queryParamsRaw: APIGatewayProxyEventQueryStringParameters | null = event.queryStringParameters
    const queryParamsSchema = this.requestQueryParamsSchema()

    let queryParams: ReqQueryParams | undefined
    if (queryParamsRaw && queryParamsSchema) {
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
              errorCode: 'VALIDATION_ERROR',
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
        log.info({ bodyValidation }, 'Request failed validation')
        return {
          state: 'invalid',
          errorResponse: {
            statusCode: 400,
            body: JSON.stringify({
              detail: bodyValidation.error.message,
              errorCode: 'VALIDATION_ERROR',
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
