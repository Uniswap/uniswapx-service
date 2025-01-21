import { DocumentClient } from 'aws-sdk/clients/dynamodb'
import Logger from 'bunyan'
import { Entity, Table } from 'dynamodb-toolbox'
import { DYNAMODB_TYPES } from '../config/dynamodb'
import { TABLE_NAMES } from './util'

interface MethodParameters {
    calldata: string
    value: string
    to: string
}

export interface Route {
    quote: string
    quote_gas_adjusted: string
    gas_price_wei: string
    gas_use_estimate_quote: string
    gas_use_estimate: string
    method_parameters: MethodParameters
}

export interface ExtrinsicValues {
  quoteId: string
  referencePrice: string
  priceImpact: number
  route: Route
  pair: string
}

export interface ExtrinsicValuesRepository {
  put(values: ExtrinsicValues): Promise<void>
  getByQuoteId(quoteId: string): Promise<ExtrinsicValues | undefined>
}

export class DynamoExtrinsicValuesRepository implements ExtrinsicValuesRepository {
  private readonly entity: Entity

  static create(documentClient: DocumentClient): ExtrinsicValuesRepository {
    const log = Logger.createLogger({
      name: 'ExtrinsicValuesRepository',
      serializers: Logger.stdSerializers,
    })

    const table = new Table({
      name: TABLE_NAMES.ExtrinsicValues,
      partitionKey: 'quoteId',
      DocumentClient: documentClient,
    })

    const entity = new Entity({
      name: 'ExtrinsicValues',
      attributes: {
        quoteId: { partitionKey: true, type: DYNAMODB_TYPES.STRING },
        referencePrice: { type: DYNAMODB_TYPES.STRING, required: true },
        priceImpact: { type: DYNAMODB_TYPES.NUMBER, required: true },
        route: {type: DYNAMODB_TYPES.MAP, required: true},
        pair: {type: DYNAMODB_TYPES.STRING, required: true}
      },
      table,
    } as const)

    return new DynamoExtrinsicValuesRepository(entity, log)
  }

  constructor(entity: Entity, private readonly log: Logger) {
    this.entity = entity
  }

  async put(values: ExtrinsicValues): Promise<void> {
    try {
      await this.entity.put(values)
    } catch (error) {
      this.log.error({ error, values }, 'Failed to put extrinsic values')
      throw error
    }
  }

  async getByQuoteId(quoteId: string): Promise<ExtrinsicValues | undefined> {
    const result = await this.entity.get({ quoteId }, { execute: true })
    return result.Item as ExtrinsicValues | undefined
  }
} 
