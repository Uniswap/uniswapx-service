import { APIGatewayProxyEvent } from 'aws-lambda'

export class PostOrderFactory {
  static createInputEvent = (
    config: { encodedOrder?: string; orderHash?: string; signature?: string; chainId?: number; quoteId?: string } = {}
  ): APIGatewayProxyEvent => {
    const {
      encodedOrder = '0x01',
      orderHash = '0x01',
      signature = '0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010',
      chainId = 1,
      quoteId = '55e2cfca-5521-4a0a-b597-7bfb569032d7',
    } = config
    return {
      queryStringParameters: {},
      body: JSON.stringify({
        encodedOrder,
        orderHash,
        signature,
        chainId,
        quoteId,
      }),

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any as APIGatewayProxyEvent
  }
}
