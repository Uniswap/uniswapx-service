import { APIGatewayProxyEvent } from 'aws-lambda'
import { QUOTE_ID, SIGNATURE } from '../../fixtures'

export class PostOrderRequestFactory {
  static request = (
    config: { encodedOrder?: string; signature?: string; chainId?: number; quoteId?: string; orderType?: string } = {}
  ): APIGatewayProxyEvent => {
    const {
      encodedOrder = '0x01',
      signature = SIGNATURE,
      chainId = 1,
      quoteId = QUOTE_ID,
      orderType = undefined,
    } = config
    return {
      queryStringParameters: {},
      body: JSON.stringify({
        encodedOrder,
        signature,
        chainId,
        quoteId,
        orderType,
      }),

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any as APIGatewayProxyEvent
  }
}
