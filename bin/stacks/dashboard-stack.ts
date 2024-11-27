import * as cdk from 'aws-cdk-lib'
import * as aws_cloudwatch from 'aws-cdk-lib/aws-cloudwatch'
import { Construct } from 'constructs'
import * as _ from 'lodash'
import { SUPPORTED_CHAINS } from '../../lib/util/chain'
import { SERVICE_NAME } from '../constants'

export const METRIC_NAMESPACE = 'Uniswap'

export type LambdaWidget = {
  type: string
  x: number
  y: number
  width: number
  height: number
  properties: { view: string; stacked: boolean; metrics: string[][]; region: string; title: string; stat: string }
}

export interface DashboardProps extends cdk.NestedStackProps {
  apiName: string
  postOrderLambdaName: string
  getOrdersLambdaName: string
  getNonceLambdaName: string
  orderStatusLambdaName: string
  chainIdToStatusTrackingStateMachineArn: { [key: string]: string }
}

export class DashboardStack extends cdk.NestedStack {
  constructor(scope: Construct, name: string, props: DashboardProps) {
    super(scope, name, props)

    const { apiName, chainIdToStatusTrackingStateMachineArn, orderStatusLambdaName, postOrderLambdaName } = props
    const region = cdk.Stack.of(this).region

    new aws_cloudwatch.CfnDashboard(this, `${SERVICE_NAME}Dashboard`, {
      dashboardName: `${SERVICE_NAME}Dashboard`,
      dashboardBody: JSON.stringify({
        periodOverride: 'inherit',
        widgets: [
          {
            height: 6,
            width: 12,
            y: 1,
            x: 0,
            type: 'metric',
            properties: {
              metrics: [
                ['AWS/ApiGateway', 'Count', 'ApiName', apiName, { label: 'Requests' }],
                ['.', '5XXError', '.', '.', { label: '5XXError Responses', color: '#ff7f0e' }],
                ['.', '4XXError', '.', '.', { label: '4XXError Responses', color: '#2ca02c' }],
              ],
              view: 'timeSeries',
              stacked: false,
              region,
              stat: 'Sum',
              period: 300,
              title: 'Total Requests/Responses | 5min',
            },
          },
          {
            height: 6,
            width: 12,
            y: 1,
            x: 12,
            type: 'metric',
            properties: {
              metrics: [
                [{ expression: 'm1 * 100', label: '5XX Error Rate', id: 'e1', color: '#ff7f0e' }],
                [{ expression: 'm2 * 100', label: '4XX Error Rate', id: 'e2', color: '#2ca02c' }],
                ['AWS/ApiGateway', '5XXError', 'ApiName', apiName, { id: 'm1', label: '5XXError', visible: false }],
                ['.', '4XXError', '.', '.', { id: 'm2', visible: false }],
              ],
              view: 'timeSeries',
              stacked: false,
              region,
              stat: 'Average',
              period: 300,
              title: '5XX/4XX Error Rates | 5min',
              setPeriodToTimeRange: true,
              yAxis: {
                left: {
                  showUnits: false,
                  label: '%',
                },
              },
            },
          },
          {
            height: 6,
            width: 8,
            y: 13,
            x: 0,
            type: 'metric',
            properties: {
              metrics: [['AWS/ApiGateway', 'Latency', 'ApiName', apiName]],
              view: 'timeSeries',
              stacked: false,
              region,
              period: 300,
              stat: 'p90',
              title: 'Latency p90 | 5min',
            },
          },
          {
            height: 6,
            width: 12,
            y: 7,
            x: 12,
            type: 'metric',
            properties: {
              metrics: [
                [{ expression: '(por5xx/por) * 100', label: 'PostOrder5XXErrorRate', id: 'r11', region, stat: 'Sum' }],
                [{ expression: '(por4xx/por) * 100', label: 'PostOrder4XXErrorRate', id: 'r21', region, stat: 'Sum' }],
                ['Uniswap', 'PostOrderRequest', 'Service', 'UniswapXService', { id: 'por', visible: false, region }],
                ['.', 'PostOrderStatus4XX', '.', '.', { id: 'por4xx', visible: false, region }],
                ['.', 'PostOrderStatus5XX', '.', '.', { id: 'por5xx', visible: false, region }],
                [{ expression: '(por5xx/gor) * 100', label: 'GetOrders5XXErrorRate', id: 'r31', region, stat: 'Sum' }],
                [{ expression: '(por4xx/gor) * 100', label: 'GetOrders4XXErrorRate', id: 'r41', region, stat: 'Sum' }],
                ['Uniswap', 'GetOrdersRequest', 'Service', 'UniswapXService', { id: 'gor', visible: false, region }],
                ['.', 'GetOrdersStatus4XX', '.', '.', { id: 'gor4xx', visible: false, region }],
                ['.', 'GetOrdersStatus5XX', '.', '.', { id: 'gor5xx', visible: false, region }],
                [{ expression: '(gnr5xx/gnr) * 100', label: 'GetNonce5XXErrorRate', id: 'r51', region, stat: 'Sum' }],
                [{ expression: '(gnr4xx/gnr) * 100', label: 'GetNonce4XXErrorRate', id: 'r61', region, stat: 'Sum' }],
                ['Uniswap', 'GetNonceRequest', 'Service', 'UniswapXService', { id: 'gnr', visible: false, region }],
                ['.', 'GetNonceStatus4XX', '.', '.', { id: 'gnr4xx', visible: false, region }],
                ['.', 'GetNonceStatus5XX', '.', '.', { id: 'gnr5xx', visible: false, region }],
              ],
              view: 'timeSeries',
              stacked: false,
              region,
              title: '5XX/4XX Error Rates by Endpoint',
              period: 300,
              stat: 'Sum',
            },
          },
          {
            height: 6,
            width: 12,
            y: 7,
            x: 0,
            type: 'metric',
            properties: {
              view: 'timeSeries',
              stacked: false,
              metrics: [
                ['Uniswap', 'GetOrdersRequest', 'Service', 'UniswapXService'],
                ['.', 'GetOrdersStatus5XX', '.', '.'],
                ['.', 'GetOrdersStatus4XX', '.', '.'],
                ['.', 'PostOrderRequest', '.', '.'],
                ['.', 'PostOrderStatus5XX', '.', '.'],
                ['.', 'PostOrderStatus4XX', '.', '.'],
                ['.', 'GetNonceRequest', '.', '.'],
                ['.', 'GetNonceStatus5XX', '.', '.'],
                ['.', 'GetNonceStatus4XX', '.', '.'],
              ],
              region,
              stat: 'Sum',
              title: 'Requests/Responses by Endpoint',
            },
          },
          {
            height: 6,
            width: 24,
            y: 19,
            x: 0,
            type: 'log',
            properties: {
              query: `SOURCE '/aws/lambda/${postOrderLambdaName}' | fields @timestamp, body.orderHash, body.chainId, body.tokenIn, body.tokenOut, body.startTime, body.endTime, body.deadline, body.inputStartAmount, body.inputEndAmount, body.outputStartAmount, body.outputEndAmount\n| filter eventType = 'OrderPosted'\n| sort @timestamp desc`,
              region,
              stacked: false,
              view: 'table',
              title: 'Orders Posted',
            },
          },
          {
            height: 6,
            width: 24,
            y: 32,
            x: 0,
            type: 'log',
            properties: {
              query: `SOURCE '/aws/lambda/${orderStatusLambdaName}' | fields orderInfo.orderHash as orderHash, orderInfo.tokenInChainId as chainId, orderInfo.offerer as offerer,orderInfo.exclusiveFiller as exclusiveFiller, orderInfo.filler as filler, orderInfo.tokenOut as tokenOut, orderInfo.amountOut as amountOut, orderInfo.blockNumber as blockNumber, orderInfo.txHash as txHash, orderInfo.gasUsed as gasUsed, orderInfo.gasCostInETH as gasCostInEth\n| filter ispresent(orderInfo.orderStatus) and orderInfo.orderStatus = 'filled'\n| sort @timestamp desc`,
              region,
              stacked: false,
              view: 'table',
              title: 'Orders Filled',
            },
          },
          {
            height: 6,
            width: 8,
            y: 13,
            x: 8,
            type: 'metric',
            properties: {
              metrics: _.flatMap(SUPPORTED_CHAINS, (chainId) => [
                ['Uniswap', `PostOrderChainId${chainId}Status2XX`, 'Service', 'UniswapXService'],
              ]),
              view: 'timeSeries',
              stacked: false,
              region,
              stat: 'Sum',
              period: 300,
              title: 'Orders Posted by Chain',
            },
          },
          {
            height: 6,
            width: 8,
            y: 13,
            x: 16,
            type: 'metric',
            properties: {
              metrics: _.flatMap(SUPPORTED_CHAINS, (chainId) => {
                const prefix = `c${chainId}`
                return [
                  [
                    {
                      expression: `(${prefix}m1/${prefix}m2)*100`,
                      label: `Chain${chainId} 5XX Error Rate`,
                      id: `${prefix}e1`,
                    },
                  ],
                  [
                    'Uniswap',
                    `PostOrderChainId${chainId}Status5XX`,
                    'Service',
                    'UniswapXService',
                    { region, label: `ChainId${chainId}Status5XX`, id: `${prefix}m1`, visible: false },
                  ],
                  [
                    '.',
                    `PostOrderRequestChainId${chainId}`,
                    '.',
                    '.',
                    { id: `${prefix}m2`, label: `RequestChainId${chainId}`, visible: false },
                  ],
                ]
              }),
              view: 'timeSeries',
              stacked: false,
              region,
              stat: 'Sum',
              period: 300,
              title: 'Post Order Handler 5XX Error Rates by Chain',
              yAxis: {
                left: {
                  showUnits: false,
                  label: '%',
                },
              },
            },
          },
          {
            height: 6,
            width: 24,
            y: 38,
            x: 0,
            type: 'log',
            properties: {
              query: `SOURCE '/aws/lambda/${orderStatusLambdaName}' | fields terminalOrderInfo.orderHash as orderHash, terminalOrderInfo.chainId as chainId, terminalOrderInfo.orderStatus as orderStatus, terminalOrderInfo.validation as validation, terminalOrderInfo.startingBlockNumber as startingBlockNumber, terminalOrderInfo.retryCount as retryCount, terminalOrderInfo.getFillLogAttempts as getFillLogAttempts, terminalOrderInfo.quoteId as quoteId, terminalOrderInfo.settledAmounts as settledAmounts\n| filter ispresent(terminalOrderInfo.orderStatus) and terminalOrderInfo.orderStatus != 'filled'\n| sort @timestamp desc`,
              region,
              stacked: false,
              title: 'Orders Not Filled',
              view: 'table',
            },
          },
          {
            height: 6,
            width: 24,
            y: 44,
            x: 0,
            type: 'log',
            properties: {
              query: `SOURCE '/aws/lambda/${orderStatusLambdaName}' | fields @timestamp, orderInfo.exclusiveFiller, (orderInfo.exclusiveFiller != orderInfo.filler or orderInfo.orderStatus = 'expired') as faded
              | filter ispresent(orderInfo.orderStatus) and (orderInfo.orderStatus = 'filled' or orderinfo.orderStatus = 'expired')
              | filter orderInfo.exclusiveFiller != '0x0000000000000000000000000000000000000000'
              | filter ispresent(orderInfo.exclusiveFiller)
              | stats count() as exclusiveOrders, sum(faded) as fadeCount by bin(1h)`,
              region,
              stacked: false,
              title: 'Exclusive Orders',
              view: 'timeSeries',
            },
          },
          {
            height: 6,
            width: 24,
            y: 50,
            x: 0,
            type: 'log',
            properties: {
              query: `SOURCE '/aws/lambda/${orderStatusLambdaName}' | fields @timestamp, orderInfo.exclusiveFiller, (orderInfo.exclusiveFiller != orderInfo.filler or orderInfo.orderStatus = 'expired') as faded
              | filter ispresent(orderInfo.orderStatus) and (orderInfo.orderStatus = 'filled' or orderinfo.orderStatus = 'expired')
              | filter orderInfo.exclusiveFiller != '0x0000000000000000000000000000000000000000'
              | filter ispresent(orderInfo.exclusiveFiller)
              | stats ((count()-sum(faded)) / count()) as fillRate by orderInfo.exclusiveFiller`,
              region,
              stacked: false,
              title: 'Fill Rate by Filler',
              view: 'bar',
            },
          },
          {
            height: 6,
            width: 8,
            y: 26,
            x: 0,
            type: 'metric',
            properties: {
              metrics: _.flatMap(SUPPORTED_CHAINS, (chainId) => [
                [
                  'AWS/States',
                  'ExecutionTime',
                  'StateMachineArn',
                  chainIdToStatusTrackingStateMachineArn[chainId],
                  { region, label: `ExecutionTime Chain ${chainId}` },
                ],
              ]),
              view: 'timeSeries',
              stacked: false,
              region,
              title: 'Order Status Sfn Execution Times by Chain',
              period: 300,
              stat: 'p90',
            },
          },
          {
            height: 6,
            width: 8,
            y: 26,
            x: 8,
            type: 'metric',
            properties: {
              metrics: _.flatMap(SUPPORTED_CHAINS, (chainId) => {
                const prefix = `c${chainId}`
                return [
                  [
                    {
                      expression: `(${prefix}m2+${prefix}m3+${prefix}m4)/(${prefix}m1)*100`,
                      label: `Error Rate Chain ${chainId}`,
                      id: `${prefix}e1`,
                      stat: 'Sum',
                    },
                  ],
                  [
                    'AWS/States',
                    'ExecutionsStarted',
                    'StateMachineArn',
                    chainIdToStatusTrackingStateMachineArn[chainId],
                    { region, id: `${prefix}m1`, visible: false },
                  ],
                  ['.', 'ExecutionsFailed', '.', '.', { region, id: `${prefix}m2`, visible: false }],
                  ['.', 'ExecutionsTimedOut', '.', '.', { region, id: `${prefix}m3`, visible: false }],
                  ['.', 'ExecutionsAborted', '.', '.', { region, id: `${prefix}m4`, visible: false }],
                ]
              }),
              view: 'timeSeries',
              stacked: false,
              region,
              title: 'Order Status Sfn Error Rates by Chain',
              period: 300,
              stat: 'Sum',
            },
          },
          {
            height: 6,
            width: 8,
            y: 26,
            x: 16,
            type: 'metric',
            properties: {
              metrics: _.flatMap(SUPPORTED_CHAINS, (chainId) => [
                [
                  'AWS/States',
                  'ExecutionThrottled',
                  'StateMachineArn',
                  chainIdToStatusTrackingStateMachineArn[chainId],
                  { region, label: `ExecutionThrottledChainId${chainId}` },
                ],
                ['.', 'ExecutionsFailed', '.', '.', { region, label: `ExecutionsFailedChainId${chainId}` }],
                ['.', 'ExecutionsStarted', '.', '.', { region, visible: false }],
                ['.', 'ExecutionsTimedOut', '.', '.', { region, label: `ExecutionsTimedOutChainId${chainId}` }],
                ['.', 'ExecutionsSucceeded', '.', '.', { region, label: `ExecutionsSucceededChainId${chainId}` }],
                ['.', 'ExecutionsAborted', '.', '.', { region, label: `ExecutionsAbortedChainId${chainId}` }],
              ]),
              view: 'timeSeries',
              stacked: false,
              region,
              title: 'Order Status Sfn Terminal States by Chain',
              period: 300,
              stat: 'Sum',
            },
          },
          {
            height: 6,
            width: 12,
            y: 32,
            x: 0,
            type: 'metric',
            properties: {
              metrics: _.flatMap(SUPPORTED_CHAINS, (chainId) => [
                ['Uniswap', `OrderSfn-PercentDecayedUntilFill-chain-${chainId}`, 'Service', `UniswapXService`],
                ['.', '.', '.', `.`, { stat: 'p99' }],
                ['.', '.', '.', `.`, { stat: 'p50' }],
                ['.', '.', '.', `.`, { stat: 'Average' }],
              ]),
              view: 'timeSeries',
              region,
              title: 'Order Percent Decay Until Fill by Chain',
              period: 300,
              stat: 'p90',
            },
          },
          {
            height: 6,
            width: 12,
            y: 32,
            x: 12,
            type: 'metric',
            properties: {
              metrics: _.flatMap(SUPPORTED_CHAINS, (chainId) => [
                ['Uniswap', `OrderSfn-BlocksUntilFill-chain-${chainId}`, 'Service', `UniswapXService`],
                ['.', '.', '.', `.`, { stat: 'p99' }],
                ['.', '.', '.', `.`, { stat: 'p50' }],
              ]),
              view: 'timeSeries',
              region,
              title: 'Blocks Until Fill by Chain',
              period: 300,
              stat: 'p90',
            },
          },
          {
            height: 6,
            width: 12,
            y: 56,
            x: 0,
            type: 'metric',
            properties: {
              metrics: _.flatMap(SUPPORTED_CHAINS, (chainId) => [
                ['Uniswap', `OrderStaleness-chain-${chainId}`, 'Service', `UniswapXService`],
                ['.', '.', '.', `.`, { stat: 'p99' }],
                ['.', '.', '.', `.`, { stat: 'p50' }],
                ['.', '.', '.', `.`, { stat: 'Average' }],
              ]),
              view: 'timeSeries',
              region,
              title: 'DutchV2 Order Staleness',
              period: 300,
              stat: 'p90',
            },
          },
          {
            height: 6,
            width: 12,
            y: 56,
            x: 12,
            type: 'metric',
            properties: {
              metrics: _.flatMap(SUPPORTED_CHAINS, (chainId) => [
                ['Uniswap', `StaleOrder-chain-${chainId}`, 'Service', `UniswapXService`],
              ]),
              view: 'timeSeries',
              region,
              title: 'DutchV2 Stale Order Count',
              period: 300,
              stat: 'Sum',
            },
          },
          {
            height: 1,
            width: 24,
            y: 25,
            x: 0,
            type: 'text',
            properties: {
              markdown: '# Order Status Step Function',
            },
          },
          {
            height: 1,
            width: 24,
            y: 0,
            x: 0,
            type: 'text',
            properties: {
              markdown: '# API',
            },
          },
        ],
      }),
    })
  }
}
