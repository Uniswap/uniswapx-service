import { TransactionCanceledException } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, TransactWriteCommand } from '@aws-sdk/lib-dynamodb'
import { DocumentClient } from 'aws-sdk/clients/dynamodb'
import { DutchOrdersRepository } from '../../../lib/repositories/dutch-orders-repository'
import { ORDER_PUT_ATTEMPTS } from '../../../lib/repositories/generic-orders-repository'
import { dutchOrderEntity } from '../../factories/order-entities'
import { SDKDutchOrderFactory } from '../../factories/SDKDutchOrderV1Factory'
import { TEST_STORE_CONTEXT } from '../../fakes/orders-repository'

// What DynamoDB answers a cancelled put+nonce transaction with: one reason per item, order put first.
function cancelled(orderPut: string, nonce = 'None'): TransactionCanceledException {
  return new TransactionCanceledException({
    message: 'Transaction cancelled',
    $metadata: {},
    CancellationReasons: [{ Code: orderPut }, { Code: nonce }],
  })
}

// The store over a client that answers each TransactWrite with the next outcome: an error to throw, or ok.
function storeAnswering(outcomes: (Error | 'ok')[]) {
  const sent: TransactWriteCommand[] = []
  const client = {
    send: async (command: TransactWriteCommand) => {
      sent.push(command)
      const outcome = outcomes[sent.length - 1]
      if (outcome !== 'ok') {
        throw outcome
      }
      return {}
    },
  } as unknown as DynamoDBDocumentClient
  return { sent, repository: DutchOrdersRepository.create(new DocumentClient(), undefined, client) }
}

const ORDER = dutchOrderEntity(SDKDutchOrderFactory.buildDutchOrder())

describe('putOrderAndUpdateNonce', () => {
  it('stores on the first try', async () => {
    const { sent, repository } = storeAnswering(['ok'])
    expect(await repository.putOrderAndUpdateNonce(TEST_STORE_CONTEXT, ORDER, 1)).toBe('stored')
    expect(sent).toHaveLength(1)
  })

  it('answers already-stored when the order put fails its condition, without retrying', async () => {
    const { sent, repository } = storeAnswering([cancelled('ConditionalCheckFailed')])
    expect(await repository.putOrderAndUpdateNonce(TEST_STORE_CONTEXT, ORDER, 1)).toBe('already-stored')
    expect(sent).toHaveLength(1)
  })

  it('retries a conflict with a same-instant duplicate and answers already-stored once it has committed', async () => {
    const { sent, repository } = storeAnswering([
      cancelled('TransactionConflict', 'TransactionConflict'),
      cancelled('ConditionalCheckFailed'),
    ])
    expect(await repository.putOrderAndUpdateNonce(TEST_STORE_CONTEXT, ORDER, 1)).toBe('already-stored')
    expect(sent).toHaveLength(2)
  })

  it('retries a conflict on the nonce row alone and stores', async () => {
    const { sent, repository } = storeAnswering([cancelled('None', 'TransactionConflict'), 'ok'])
    expect(await repository.putOrderAndUpdateNonce(TEST_STORE_CONTEXT, ORDER, 1)).toBe('stored')
    expect(sent).toHaveLength(2)
  })

  it('gives up after its attempts if the conflicts continue', async () => {
    const conflict = cancelled('TransactionConflict')
    const { sent, repository } = storeAnswering(Array(ORDER_PUT_ATTEMPTS).fill(conflict))
    await expect(repository.putOrderAndUpdateNonce(TEST_STORE_CONTEXT, ORDER, 1)).rejects.toBe(conflict)
    expect(sent).toHaveLength(ORDER_PUT_ATTEMPTS)
  })

  it('does not retry any other cancellation or error', async () => {
    const other = cancelled('ValidationError')
    const { sent, repository } = storeAnswering([other])
    await expect(repository.putOrderAndUpdateNonce(TEST_STORE_CONTEXT, ORDER, 1)).rejects.toBe(other)
    expect(sent).toHaveLength(1)
  })
})
