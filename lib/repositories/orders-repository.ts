import { DocumentClient } from 'aws-sdk/clients/dynamodb'
import { OrderEntity } from '../entities/Order'
import { BaseOrdersRepository } from './base'

export class DynamoOrdersRepository implements BaseOrdersRepository {
  private static client: DocumentClient

  public static initialize(dbClient: DocumentClient): void {
    this.client = dbClient
  }

  async getByHash(hash: string): Promise<OrderEntity | undefined> {
    const result = await DynamoOrdersRepository.client
      .get({
        TableName: 'Orders',
        Key: {
          orderHash: hash,
        },
      })
      .promise()

    return result.Item as OrderEntity
  }

  async put(order: OrderEntity): Promise<void> {
    await DynamoOrdersRepository.client
      .put({
        TableName: 'Orders',
        Item: order,
      })
      .promise()
  }
}
