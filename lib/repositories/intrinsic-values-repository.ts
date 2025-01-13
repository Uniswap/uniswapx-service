import { DocumentClient } from 'aws-sdk/clients/dynamodb'
import Logger from 'bunyan'
import { Entity, Table } from 'dynamodb-toolbox'
import { DYNAMODB_TYPES } from '../config/dynamodb'
import { TABLE_NAMES } from './util'

export interface IntrinsicValues {
  pair: string
  pi: number
  tau: number
}

export interface IntrinsicValuesRepository {
  put(values: IntrinsicValues): Promise<void>
  getByPair(pair: string): Promise<IntrinsicValues | undefined>
}

export class DynamoIntrinsicValuesRepository implements IntrinsicValuesRepository {
  private readonly entity: Entity

  static create(documentClient: DocumentClient): IntrinsicValuesRepository {
    const log = Logger.createLogger({
      name: 'IntrinsicValuesRepository',
      serializers: Logger.stdSerializers,
    })

    const table = new Table({
      name: TABLE_NAMES.IntrinsicValues,
      partitionKey: 'pair',
      DocumentClient: documentClient,
    })

    const entity = new Entity({
      name: 'IntrinsicValues',
      attributes: {
        pair: { partitionKey: true, type: DYNAMODB_TYPES.STRING },
        pi: { type: DYNAMODB_TYPES.NUMBER, required: true },
        tau: { type: DYNAMODB_TYPES.NUMBER, required: true },
      },
      table,
    } as const)

    return new DynamoIntrinsicValuesRepository(entity, log)
  }

  constructor(entity: Entity, private readonly log: Logger) {
    this.entity = entity
  }

  async put(values: IntrinsicValues): Promise<void> {
    try {
      await this.entity.put(values)
    } catch (error) {
      this.log.error({ error, values }, 'Failed to put intrinsic values')
      throw error
    }
  }

  async getByPair(pair: string): Promise<IntrinsicValues | undefined> {
    const result = await this.entity.get({ pair }, { execute: true })
    return result.Item as IntrinsicValues | undefined
  }
} 