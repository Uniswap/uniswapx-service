import axios from 'axios'
import { DutchLimitOrder } from 'gouda-sdk'
import { v4 as uuidv4 } from 'uuid'

import { getCurrentTime } from '../util/time'

export const AMPLITUDE_URL = 'https://api2.amplitude.com/2/httpapi'

export abstract class EventLogger {
  abstract logNewOrder(decodedOrder: DutchLimitOrder): Promise<void>
}

export class AmplitudeEventLogger implements EventLogger {
  public async logNewOrder(decodedOrder: DutchLimitOrder): Promise<void> {
    await this.logEvent(
      'new_gouda_order',
      {
        walletAddress: decodedOrder.info.offerer,
      },
      {
        sellToken: decodedOrder.info.input.token,
        sellTokenAmount: decodedOrder.info.input.amount.toNumber(),
        buyToken: decodedOrder.info.outputs[0].token,
        buyTokenStartAmount: decodedOrder.info.outputs[0].startAmount.toNumber(),
        buyTokenEndAmount: decodedOrder.info.outputs[0].endAmount.toNumber(),
        startAmountPrice:
          decodedOrder.info.input.amount.toNumber() / decodedOrder.info.outputs[0].startAmount.toNumber(),
        endAmountPrice: decodedOrder.info.input.amount.toNumber() / decodedOrder.info.outputs[0].endAmount.toNumber(),
      }
    )
  }

  private async logEvent(
    eventType: string,
    eventProperties: { [key: string]: any },
    userProperties: { [key: string]: any }
  ): Promise<void> {
    await axios({
      method: 'post',
      headers: {
        'Content-Type': 'application/json',
        Accept: '*/*',
      },
      data: JSON.stringify({
        api_key: process.env.AMPLITUDE_API_KEY!,
        events: [
          {
            user_id: uuidv4(),
            time: getCurrentTime(),
            event_type: eventType,
            event_properties: eventProperties,
            user_properties: userProperties,
          },
        ],
      }),
      url: AMPLITUDE_URL,
    })
  }
}
