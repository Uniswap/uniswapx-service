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
import { CommandType } from '@uniswap/universal-router-sdk'
import { Interface } from 'ethers/lib/utils'
import { UR_EXECUTE_DEADLINE_BUFFER, UR_EXECUTE_FUNCTION, UR_EXECUTE_SELECTOR, UR_EXECUTE_WITH_DEADLINE_SELECTOR, UR_FUNCTION_SIGNATURES } from '../constants'
import { defaultAbiCoder } from '@ethersproject/abi'
import { default as Logger } from 'bunyan'

type UnimindResponse = {
  pi: number
  tau: number
}

export class GetUnimindHandler extends APIGLambdaHandler<ContainerInjected, RequestInjected, void, UnimindQueryParams, UnimindResponse> {
  public async handleRequest(
    params: APIHandleRequestParams<ContainerInjected, RequestInjected, void, UnimindQueryParams>
  ): Promise<Response<UnimindResponse> | ErrorResponse> {
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
        detail: (e as Error)?.message ?? 'Unknown error occurred'
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

export function artemisModifyCalldata(calldata: string, log: Logger, executeAddress: string): string {
    try {
      const HEX_PREFIX = "0x"
      const SELECTOR_BYTES = 4
      const CHARS_PER_BYTE = 2
      const functionSelector = calldata.slice(
        HEX_PREFIX.length, 
        HEX_PREFIX.length + SELECTOR_BYTES * CHARS_PER_BYTE
      )
      const signature = UR_FUNCTION_SIGNATURES[functionSelector]
      if (!signature) {
        throw new Error('Unrecognized function selector in calldata')
      }
        
      log.info(`Modifying calldata for ${signature}`);
      // Decode the UR execute calldata
      const iface = new Interface([signature]);
      const { commands, inputs } = iface.decodeFunctionData(UR_EXECUTE_FUNCTION, calldata);

      const commandArray = getCommands(commands)
      const inputsArray = [...inputs]
        
      // Find and remove PAY_PORTION command and its input
      const payPortionIndex = commandArray.findIndex(command => command == CommandType.PAY_PORTION)
      if (payPortionIndex !== -1) {
          commandArray.splice(payPortionIndex, 1)
          inputsArray.splice(payPortionIndex, 1)
      }

      // Find and modify SWEEP command
      const sweepIndex = commandArray.findIndex(command => command == CommandType.SWEEP)
      if (sweepIndex !== -1) {
          const sweepInput = inputsArray[sweepIndex]
          // Decode sweep parameters
          const [token, , amountMinimum] = defaultAbiCoder.decode(
              ['address', 'address', 'uint256'],
              sweepInput
          )
          // Encode the parameters with executor address as recipient
          const modifiedSweepInput = defaultAbiCoder.encode(
              ['address', 'address', 'uint256'],
              [token, executeAddress, amountMinimum]
          )
          inputsArray[sweepIndex] = modifiedSweepInput
      }
      
      // Re-encode the complete calldata
      let modifiedCalldata;
      if (functionSelector == UR_EXECUTE_SELECTOR) {
          modifiedCalldata = iface.encodeFunctionData(UR_EXECUTE_FUNCTION, [commandArray, inputsArray])
      } else if (functionSelector == UR_EXECUTE_WITH_DEADLINE_SELECTOR) {
          const newDeadline = Math.floor(Date.now()/1000) + UR_EXECUTE_DEADLINE_BUFFER;
          // This function has a deadline parameter
          modifiedCalldata = iface.encodeFunctionData(UR_EXECUTE_FUNCTION, [commandArray, inputsArray, newDeadline])
      }
      if (!modifiedCalldata) {
        throw new Error('Failed to modify calldata')
      }
      log.info('Successfully modified calldata')
      return modifiedCalldata
    } catch (e) {
      log.error('Error modifying calldata', {
          error: (e as Error)?.message ?? 'Unknown error',
          calldata
      })
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