import Joi from 'joi'
import { APIGLambdaHandler, APIHandleRequestParams, ErrorCode, ErrorResponse, Response } from '../base'
import { ContainerInjected, RequestInjected } from './injector'
import { QuoteMetadata } from '../../repositories/quote-metadata-repository'
import { UnimindParameters } from '../../repositories/unimind-parameters-repository'
import { Unit } from 'aws-embedded-metrics'
import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda'
import { metrics } from '../../util/metrics'
import { UnimindQueryParams, unimindQueryParamsSchema } from './schema'
import { DEFAULT_UNIMIND_PARAMETERS, PUBLIC_UNIMIND_PARAMETERS, UNIMIND_DEV_SWAPPER_ADDRESS } from '../../util/constants'
import { CommandParser, CommandType } from '@uniswap/universal-router-sdk'
import { Interface } from 'ethers/lib/utils'
import { EXECUTOR_ADDRESS } from '../constants'
import { defaultAbiCoder } from '@ethersproject/abi'

type UnimindResponse = {
  pi: number
  tau: number
}

export class GetUnimindHandler extends APIGLambdaHandler<ContainerInjected, RequestInjected, void, UnimindQueryParams, UnimindResponse> {
  public async handleRequest(
    params: APIHandleRequestParams<ContainerInjected, RequestInjected, void, UnimindQueryParams>
  ): Promise<Response<UnimindResponse> | ErrorResponse> {
    const log = params.requestInjected.log
    const { containerInjected, requestQueryParams } = params
    const { quoteMetadataRepository, unimindParametersRepository } = containerInjected
    try {
      const { logOnly, swapper, ...quoteMetadataFields } = requestQueryParams
      const quoteMetadata = {
        ...quoteMetadataFields,
        route: requestQueryParams.route ? JSON.parse(requestQueryParams.route) : undefined
      }
      // For requests that don't expect params, we only save the quote metadata and return
      if (logOnly) { 
        log.info('route details', { 
            route: quoteMetadata.route,
            calldata: quoteMetadata.route?.methodParameters?.calldata
        })
        const decoded = CommandParser.parseCalldata(quoteMetadata.route?.methodParameters?.calldata)
        log.info('decoded', { decodedStr: JSON.stringify(decoded, null, 2) })
        const artemisCallDataRoute = artemisModifyCalldata(quoteMetadata.route?.methodParameters?.calldata, log)
        log.info('artemisCallDataRoute', { artemisCallDataRoute })
        quoteMetadata.route.methodParameters.calldata = artemisCallDataRoute
        await quoteMetadataRepository.put(quoteMetadata)
        return {
          statusCode: 200,
          body: {
            pi: 0,
            tau: 0
          }
        }
      }

      if (!swapper || swapper != UNIMIND_DEV_SWAPPER_ADDRESS) {
        return {
            statusCode: 200,
            body: PUBLIC_UNIMIND_PARAMETERS
        }
      }

      let [, unimindParameters] = await Promise.all([
        quoteMetadataRepository.put(quoteMetadata),
        unimindParametersRepository.getByPair(requestQueryParams.pair)
      ])

      if (!unimindParameters) {
        // Use default parameters and add to unimindParametersRepository
        const entry = {
            ...DEFAULT_UNIMIND_PARAMETERS,
            pair: requestQueryParams.pair
        }
        await unimindParametersRepository.put(entry)
        unimindParameters = entry
      }

      const beforeCalculateTime = Date.now()
      const parameters = this.calculateParameters(unimindParameters, quoteMetadata)
      const afterCalculateTime = Date.now()
      const calculateTime = afterCalculateTime - beforeCalculateTime
      metrics.putMetric(`final-parameters-calculation-time`, calculateTime)

      return {
        statusCode: 200,
        body: parameters
      }
    } catch (e) {
      return {
        statusCode: 500,
        errorCode: ErrorCode.InternalError,
        detail: e instanceof Error ? e.message : 'Unknown error occurred'
      }
    }
  }

  calculateParameters(intrinsicValues: UnimindParameters, extrinsicValues: QuoteMetadata): UnimindResponse {
    // Keeping intrinsic extrinsic naming for consistency with algorithm
    const pi = intrinsicValues.pi * extrinsicValues.priceImpact
    const tau = intrinsicValues.tau * extrinsicValues.priceImpact
    return {
      pi,
      tau
    }
  }

  protected requestBodySchema(): Joi.ObjectSchema | null {
    return null
  }

  protected requestQueryParamsSchema(): Joi.ObjectSchema {
    return unimindQueryParamsSchema
  }

  protected responseBodySchema(): Joi.ObjectSchema {
    return Joi.object({
      pi: Joi.number().required(),
      tau: Joi.number().required()
    })
  }

  protected afterResponseHook(event: APIGatewayProxyEvent, _context: Context, response: APIGatewayProxyResult): void {
    const { statusCode } = response

    // Try and extract the pair from the query parameters
    let pair = 'unknown'
    try {
      const queryParams = event.queryStringParameters || {}
      pair = queryParams.pair ?? pair
    } catch (err) {
      // no-op. If we can't get pair still log the metric as unknown
    }

    const statusCodeMod = (Math.floor(statusCode / 100) * 100).toString().replace(/0/g, 'X')

    const getUnimindByPairMetricName = `GetUnimindPair${pair}Status${statusCodeMod}`
    metrics.putMetric(getUnimindByPairMetricName, 1, Unit.Count)

    const getUnimindMetricName = `GetUnimindStatus${statusCodeMod}`
    metrics.putMetric(getUnimindMetricName, 1, Unit.Count)

    const getUnimindRequestMetricName = `GetUnimindRequest`
    metrics.putMetric(getUnimindRequestMetricName, 1, Unit.Count)

    const getUnimindRequestByPairMetricName = `GetUnimindRequestPair${pair}`
    metrics.putMetric(getUnimindRequestByPairMetricName, 1, Unit.Count)
  }
}

export function artemisModifyCalldata(calldata: string, log?: any): string {
    try {
        let parsedCommands;
        let parsedInputs;

        // Decode the main execute function
        if (calldata.slice(2, 10) == "24856bc3") {
            const iface = new Interface(["function execute(bytes commands, bytes[] inputs)"])
            const { commands, inputs } = iface.decodeFunctionData('execute', calldata)
            parsedCommands = commands
            parsedInputs = inputs
            log.info('parsedCommands', { parsedCommands })
            log.info('parsedInputs', { parsedInputs })
        } else if (calldata.slice(2, 10) == "3593564c") {
            const iface = new Interface(["function execute(bytes commands, bytes[] inputs, uint256 deadline)"])
            const { commands, inputs } = iface.decodeFunctionData('execute', calldata)
            parsedCommands = commands
            parsedInputs = inputs
            log.info('parsedCommands', { parsedCommands })
            log.info('parsedInputs', { parsedInputs })
        }
        
        let commandArray = getCommands(parsedCommands)
        let inputsArray = [...parsedInputs]
        log.info('commandArray before removing PAY_PORTION', { commandArray })
        log.info('inputsArray before removing PAY_PORTION', { inputsArray })
        
        // Remove PAY_PORTION command and input
        const payPortionIndex = commandArray.findIndex(command => command == CommandType.PAY_PORTION)
        if (payPortionIndex !== -1) {
            commandArray.splice(payPortionIndex, 1)
            inputsArray.splice(payPortionIndex, 1)
        }
        log.info('commandArray after removing PAY_PORTION', { commandArray })
        log.info('inputsArray after removing PAY_PORTION', { inputsArray })
        // Find and modify SWEEP command
        const sweepIndex = commandArray.findIndex(command => command == CommandType.SWEEP)
        if (sweepIndex !== -1) {
            const sweepInput = inputsArray[sweepIndex]
            
            // Decode sweep parameters
            const [token, , amountMinimum] = defaultAbiCoder.decode(
                ['address', 'address', 'uint256'],
                sweepInput
            )
            log.info('sweepInput', { sweepInput })
            log.info('original token', { token })
            log.info('original amountMinimum', { amountMinimum })

            // Encode the parameters with executor address as recipient
            const modifiedSweepInput = defaultAbiCoder.encode(
                ['address', 'address', 'uint256'],
                [token, EXECUTOR_ADDRESS, amountMinimum]
            )

            log.info('modifiedSweepInput', { modifiedSweepInput })
            log.info('modified token', { token })
            log.info('modified address', { address: EXECUTOR_ADDRESS })
            log.info('modified amountMinimum', { amountMinimum })
            
            inputsArray[sweepIndex] = modifiedSweepInput
        }
        
        // Re-encode the complete calldata
        let modifiedCalldata;
        if (calldata.slice(2, 10) == "24856bc3") {
            const iface = new Interface(["function execute(bytes commands, bytes[] inputs)"])
            modifiedCalldata = iface.encodeFunctionData('execute', [commandArray, inputsArray])
        } else if (calldata.slice(2, 10) == "3593564c") {
            const iface = new Interface(["function execute(bytes commands, bytes[] inputs, uint256 deadline)"])
            const newDeadline = Math.floor(Date.now()/1000) + 60;
            // This function has a deadline parameter
            modifiedCalldata = iface.encodeFunctionData('execute', [commandArray, inputsArray, newDeadline])
        }

        log.info('modifiedCalldata', { modifiedCalldata })

        return modifiedCalldata ?? ""
    } catch (e) {
        if (log) {
            log.error('Error modifying calldata', { 
                error: e instanceof Error ? e.message : 'Unknown error',
                calldata
            })
        }
        return ""
    }
}

function getCommands(commands: string): CommandType[] {
    const commandTypes = []

    for (let i = 2; i < commands.length; i += 2) {
      const byte = commands.substring(i, i + 2)
      commandTypes.push(parseInt(byte, 16) as CommandType)
    }

    return commandTypes
  }