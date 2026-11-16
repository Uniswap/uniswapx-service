import { StaticJsonRpcProvider } from '@ethersproject/providers'
import { createServer, IncomingMessage, Server, ServerResponse } from 'http'
import { AddressInfo, Socket } from 'net'

// How the node answers one request: a result, a JSON-RPC error, or never.
export type RpcAnswer = { result: string } | { error: { code: number; message: string; data?: string } } | 'hang'

export type EthCallRequest = { from?: string; to?: string; data?: string }

// geth's answer to an eth_call that reverted without data.
export const REVERT_WITHOUT_DATA: RpcAnswer = { error: { code: -32000, message: 'execution reverted' } }

/**
 * A JSON-RPC node over HTTP for one chain, so a real ethers provider turns its answers into
 * results and errors exactly as it does in production. Answers eth_getCode with `getCode` and
 * eth_call with `ethCall`.
 */
export class FakeJsonRpcNode {
  // Methods in the order they arrived, eth_chainId left out.
  public readonly methods: string[] = []
  public readonly ethCalls: EthCallRequest[] = []
  public getCode: RpcAnswer = { result: '0x' }
  public ethCall: RpcAnswer | ((request: EthCallRequest) => RpcAnswer) = { result: '0x' }
  private readonly sockets: Socket[] = []
  private readonly server: Server = createServer((req, res) => this.answer(req, res))

  constructor(private readonly chainId: number) {
    this.server.on('connection', (socket) => this.sockets.push(socket))
  }

  async start(): Promise<void> {
    await new Promise<void>((resolve) => this.server.listen(0, '127.0.0.1', resolve))
  }

  async stop(): Promise<void> {
    this.sockets.forEach((socket) => socket.destroy())
    await new Promise<void>((resolve) => this.server.close(() => resolve()))
  }

  provider(): StaticJsonRpcProvider {
    const { port } = this.server.address() as AddressInfo
    return new StaticJsonRpcProvider({ url: `http://127.0.0.1:${port}`, timeout: 5_000 }, this.chainId)
  }

  private answer(req: IncomingMessage, res: ServerResponse): void {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      const { id, method, params } = JSON.parse(body)
      const answer = this.answerFor(method, params)
      if (answer === 'hang') {
        return
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ jsonrpc: '2.0', id, ...answer }))
    })
  }

  private answerFor(method: string, params: unknown[]): RpcAnswer {
    if (method === 'eth_chainId') {
      return { result: `0x${this.chainId.toString(16)}` }
    }
    this.methods.push(method)
    if (method === 'eth_getCode') {
      return this.getCode
    }
    if (method === 'eth_call') {
      const request = ethCallRequest(params[0])
      this.ethCalls.push(request)
      return typeof this.ethCall === 'function' ? this.ethCall(request) : this.ethCall
    }
    return { error: { code: -32601, message: `method ${method} not found` } }
  }
}

function ethCallRequest(param: unknown): EthCallRequest {
  const read = (key: string): string | undefined => {
    const value = typeof param === 'object' && param !== null ? Reflect.get(param, key) : undefined
    return typeof value === 'string' ? value : undefined
  }
  return { from: read('from'), to: read('to'), data: read('data') }
}
