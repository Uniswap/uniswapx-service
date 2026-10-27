import { AddressInfo, createServer, Server, Socket } from 'net'
import type { SfnClientOptions } from '../../lib/handlers/shared/sfn'

/**
 * A TCP server that accepts every connection and never writes a byte: what a hung StartExecution
 * looks like from the client. Each accepted connection is one SDK attempt.
 */
export class SilentServer {
  public connections = 0
  private readonly sockets: Socket[] = []
  private readonly server: Server = createServer((socket) => {
    this.connections++
    this.sockets.push(socket)
  })

  async start(): Promise<void> {
    await new Promise<void>((resolve) => this.server.listen(0, '127.0.0.1', resolve))
  }

  get endpoint(): string {
    return `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`
  }

  async stop(): Promise<void> {
    this.sockets.forEach((socket) => socket.destroy())
    await new Promise<void>((resolve) => this.server.close(() => resolve()))
  }
}

export const silentServerClientOptions = (server: SilentServer): SfnClientOptions => ({
  region: 'us-east-2',
  endpoint: server.endpoint,
  credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
})
