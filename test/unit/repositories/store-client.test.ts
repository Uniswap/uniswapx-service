import { GetCommand } from '@aws-sdk/lib-dynamodb'
import { createStoreClient } from '../../../lib/repositories/store-client'
import { SilentServer } from '../../fakes/silent-server'

describe('createStoreClient', () => {
  let server: SilentServer

  beforeEach(async () => {
    server = new SilentServer()
    await server.start()
  })

  afterEach(async () => {
    await server.stop()
  })

  const clientFor = (requestTimeoutMs: number, attempts: number) =>
    createStoreClient({
      requestTimeoutMs,
      attempts,
      region: 'us-east-2',
      endpoint: server.endpoint,
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
    })

  it('gives up on a table that never answers after its attempts, each bounded by the request timeout', async () => {
    const requestTimeoutMs = 200
    const attempts = 3
    const started = Date.now()

    await expect(
      clientFor(requestTimeoutMs, attempts).send(new GetCommand({ TableName: 'Orders', Key: { orderHash: '0x01' } }))
    ).rejects.toMatchObject({ name: 'TimeoutError' })

    expect(server.connections).toEqual(attempts)
    // attempts x timeout, plus the SDK's jittered backoff between attempts
    expect(Date.now() - started).toBeLessThan(attempts * requestTimeoutMs + 2_000)
  })

  it('makes exactly one attempt when told to', async () => {
    await expect(
      clientFor(200, 1).send(new GetCommand({ TableName: 'Orders', Key: { orderHash: '0x01' } }))
    ).rejects.toMatchObject({ name: 'TimeoutError' })
    expect(server.connections).toEqual(1)
  })
})
