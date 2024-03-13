import { APIGatewayProxyEvent } from 'aws-lambda'
import { QUOTE_ID, SIGNATURE } from '../fixtures'

export class PostOrderFactory {
  static createInputEvent = (
    config: { encodedOrder?: string; orderHash?: string; signature?: string; chainId?: number; quoteId?: string } = {}
  ): APIGatewayProxyEvent => {
    const { encodedOrder = '0x01', orderHash = '0x01', signature = SIGNATURE, chainId = 1, quoteId = QUOTE_ID } = config
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
