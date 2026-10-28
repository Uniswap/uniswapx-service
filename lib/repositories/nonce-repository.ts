import { DynamoDBDocumentClient, GetCommand, TransactWriteCommandInput } from '@aws-sdk/lib-dynamodb'

import { DYNAMODB_TYPES } from '../config/dynamodb'
import { OrderStoreContext } from './base'
import { AttributeTypes, updateExpression } from './toolbox-compat'
import { TABLE_NAMES } from './util'

export type TransactWriteItem = NonNullable<TransactWriteCommandInput['TransactItems']>[number]

const NONCE_ENTITY = 'Nonce'
const NONCE_ATTRIBUTES: AttributeTypes = {
  offerer: { partitionKey: true, type: DYNAMODB_TYPES.STRING },
  nonce: { type: DYNAMODB_TYPES.STRING },
}

// One row per swapper and chain, keyed `${address}-${chainId}`, holding the last nonce used by an
// order posted through this service.
export class NonceRepository {
  static create(client: DynamoDBDocumentClient): NonceRepository {
    return new NonceRepository(client)
  }

  private constructor(private readonly client: DynamoDBDocumentClient) {}

  /**
   * Returns the last used nonce for the address on the given chain, or undefined
   * if the address has never posted an order through this service.
   */
  public async getNonce(_ctx: OrderStoreContext, address: string, chainId: number): Promise<string | undefined> {
    const { Item } = await this.client.send(
      new GetCommand({
        TableName: TABLE_NAMES.Nonces,
        Key: { offerer: `${address}-${chainId}` },
        ConsistentRead: true,
      })
    )
    const nonce = Item?.nonce
    return typeof nonce === 'string' ? nonce : undefined
  }

  // The nonce write for the order post transaction, so the order and its nonce land together.
  public updateTransaction(address: string, chainId: number, nonce: string, now: Date): TransactWriteItem {
    return {
      Update: {
        TableName: TABLE_NAMES.Nonces,
        Key: { offerer: `${address}-${chainId}` },
        ...updateExpression({ nonce }, NONCE_ATTRIBUTES, NONCE_ENTITY, now),
      },
    }
  }
}
