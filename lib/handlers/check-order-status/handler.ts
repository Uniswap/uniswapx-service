import { EventWatcher, OrderValidation, OrderValidator, parseOrder, REACTOR_ADDRESS_MAPPING } from 'gouda-sdk'
import { ChainId } from '../../util/chains'
import { computeNextState } from '../../util/states'
import { HandleRequestParams, StateMachineLambdaHandler } from '../base/handler'
import { ORDER_STATUS } from '../types/order'
import { CheckOrderStatusRequestInjected, ContainerInjected } from './injector'
import { Payload, StateOutput } from './schema'

export type CheckOrderStatusQueryParams = {
  orderHash: string
  prevCheckOrderOutput: StateOutput
  startBlockNumber: number
  encodedOrder: string
  signature: string
  chainId: ChainId
}
export class checkOrderStatusLambdaHandler extends StateMachineLambdaHandler<
  ContainerInjected,
  CheckOrderStatusRequestInjected,
  CheckOrderStatusQueryParams,
  Payload
> {
  public async handleRequest(
    params: HandleRequestParams<
    ContainerInjected,
      CheckOrderStatusRequestInjected,
      null,
      CheckOrderStatusQueryParams
    >
  ): Promise<Payload> {
    const {
      requestQueryParams: { encodedOrder, signature, chainId, orderHash, prevCheckOrderOutput, startBlockNumber },
      requestInjected: { log, blockNumber, provider },
    } = params
    log.info(`Checking status for order with hash ${orderHash}`)
    const prevStatus = prevCheckOrderOutput ? prevCheckOrderOutput.Payload.orderStatus : ORDER_STATUS.UNVERIFIED
    // check if prevCheckOrderOutput.Payload.prevBlockNumber exists, otherwise use initial block number
    const prevBlockNumber = prevCheckOrderOutput ? prevCheckOrderOutput.Payload.prevBlockNumber : startBlockNumber

    // get latest block
    const order = parseOrder(encodedOrder)
    let orderStatus = prevStatus

    // no new blocks
    if (blockNumber <= prevBlockNumber) {
      return { prevBlockNumber: blockNumber, orderStatus: prevStatus, orderStatusChanged: false }
    }

    // TODO: Query Once protocol adds 'indexed' to orderHash to field for filled and cancelled events
    /* const isFilled = await reactorContract.queryFilter(
	      eventFilter: {
		      topics: [...]
	      },
	      fromBlockOrBlockhash: <block #>,
  	    toBlock: <new block #>
    )*/
    const validator = new OrderValidator(provider, chainId)
    const validation = await validator.validate({ order, signature })

    // Nonce Used means the order was either filled or cancelled
    if (validation == OrderValidation.NonceUsed) {
      const watcher = new EventWatcher(provider, REACTOR_ADDRESS_MAPPING[chainId].DutchLimit)
      // Check last 5 blocks for fill event
      // TODO(TRD-157):  Make checking for order filled/cancelled status more robust. We currently only look back 5 blocks for events. If there is an Infura outage we could miss these events and begin marking filled orders as cancelled.
      const events = await watcher.getFillEvents(blockNumber - 5, blockNumber)
      if (events.find((event) => event.orderHash == orderHash)) {
        orderStatus = ORDER_STATUS.FILLED
      } else {
        orderStatus = ORDER_STATUS.CANCELLED
      }
      return { prevBlockNumber: blockNumber, orderStatus, orderStatusChanged: true }
    }
    orderStatus = computeNextState(prevStatus, validation)

    log.info(`Order is in ${orderStatus} status`)

    return {
      prevBlockNumber: blockNumber,
      orderStatusChanged: prevStatus != orderStatus,
      orderStatus,
    }
  }
}
