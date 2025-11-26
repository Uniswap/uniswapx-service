import { DocumentClient } from 'aws-sdk/clients/dynamodb'
import Logger from 'bunyan'
import { Entity, Table } from 'dynamodb-toolbox'
import { DYNAMODB_TYPES } from '../config/dynamodb'
import { TABLE_NAMES } from './util'

export interface UnimindParameters {
  pair: string
  intrinsicValues: string
  count: number
  version: number
  batchNumber: number // Tracks parameter update iterations
  lastUpdatedAt?: number // Unix timestamp for update tracking
}

export interface UnimindParametersRepository {
  put(values: UnimindParameters): Promise<void>
  getByPair(pair: string): Promise<UnimindParameters | undefined>
}

export class DynamoUnimindParametersRepository implements UnimindParametersRepository {
  private readonly entity: Entity

  static create(documentClient: DocumentClient): UnimindParametersRepository {
    const log = Logger.createLogger({
      name: 'UnimindParametersRepository',
      serializers: Logger.stdSerializers,
    })

    const table = new Table({
      name: TABLE_NAMES.UnimindParameters,
      partitionKey: 'pair',
      DocumentClient: documentClient,
    })

    const entity = new Entity({
      name: 'UnimindParameters',
      attributes: {
        pair: { partitionKey: true, type: DYNAMODB_TYPES.STRING },
        intrinsicValues: { type: DYNAMODB_TYPES.STRING, required: true },
        count: { type: DYNAMODB_TYPES.NUMBER, required: true },
        version: { type: DYNAMODB_TYPES.NUMBER, required: true },
        batchNumber: { type: DYNAMODB_TYPES.NUMBER, required: true, default: 0 },
        lastUpdatedAt: { type: DYNAMODB_TYPES.NUMBER, required: false },
      },
      table,
    } as const)

    return new DynamoUnimindParametersRepository(entity, log)
  }

  constructor(entity: Entity, private readonly log: Logger) {
    this.entity = entity
  }

  async put(values: UnimindParameters): Promise<void> {
    try {
      await this.entity.put(values)
    } catch (error) {
      this.log.error({ error, values }, 'Failed to put unimind parameters')
      throw error
    }
  }

  async getByPair(pair: string): Promise<UnimindParameters | undefined> {
    const result = await this.entity.get({ pair }, { execute: true })
    return result.Item as UnimindParameters | undefined
  }
}
