import { DocumentClient } from 'aws-sdk/clients/dynamodb'
import { Entity, Table } from 'dynamodb-toolbox'

import { DYNAMODB_TYPES } from '../config/dynamodb'
import { TABLE_NAMES } from './util'

// One row per swapper and chain, keyed `${address}-${chainId}`, holding the last nonce used by an
// order posted through this service.
export class NonceRepository {
  static create(documentClient: DocumentClient): NonceRepository {
    const nonceTable = new Table({
      name: TABLE_NAMES.Nonces,
      partitionKey: 'offerer',
      DocumentClient: documentClient,
    })

    const nonceEntity = new Entity({
      name: 'Nonce',
      attributes: {
        offerer: { partitionKey: true, type: DYNAMODB_TYPES.STRING },
        nonce: { type: DYNAMODB_TYPES.STRING, required: true },
      },
      table: nonceTable,
    } as const)

    return new NonceRepository(nonceEntity)
  }

  private constructor(private readonly entity: Entity) {}

  /**
   * Returns the last used nonce for the address on the given chain, or undefined
   * if the address has never posted an order through this service.
   */
  public async getNonceByAddressAndChain(address: string, chainId: number): Promise<string | undefined> {
    const res = await this.entity.query(`${address}-${chainId}`, {
      limit: 1,
      reverse: true,
      consistent: true,
      execute: true,
    })
    if (res.Items && res.Items.length > 0) {
      return res.Items[0].nonce
    }
    return undefined
  }

  // The nonce write for the order post transaction, so the order and its nonce land together.
  public updateTransaction(address: string, chainId: number, nonce: string) {
    return this.entity.updateTransaction({
      offerer: `${address}-${chainId}`,
      nonce,
    })
  }
}
