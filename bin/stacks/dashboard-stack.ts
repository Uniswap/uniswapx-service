import * as cdk from 'aws-cdk-lib'
import * as aws_cloudwatch from 'aws-cdk-lib/aws-cloudwatch'
import { Construct } from 'constructs'
import * as _ from 'lodash'
import { TABLE_KEY } from '../../lib/config/dynamodb'
import { TABLE_NAMES } from '../../lib/repositories/util'
import { SUPPORTED_CHAINS } from '../../lib/util/chain'
import { SERVICE_NAME } from '../constants'

export const METRIC_NAMESPACE = 'Uniswap'

// The GSIs the polling endpoints read; see lib/repositories/util.ts getTableIndices.
const CHAIN_STATUS_GSI = `${TABLE_KEY.CHAIN_ID_ORDER_STATUS}-${TABLE_KEY.CREATED_AT}-all`
const STATUS_GSI = `${TABLE_KEY.ORDER_STATUS}-${TABLE_KEY.CREATED_AT}-all`

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
  getUnimindLambdaName: string
  orderStatusLambdaName: string
  chainIdToStatusTrackingStateMachineArn: { [key: string]: string }
  // Drawn as a line on the Get Orders concurrency chart when set.
  getOrdersReservedConcurrency?: number
}

export class DashboardStack extends cdk.NestedStack {
  constructor(scope: Construct, name: string, props: DashboardProps) {
    super(scope, name, props)

    const {
      apiName,
      chainIdToStatusTrackingStateMachineArn,
      orderStatusLambdaName,
      postOrderLambdaName,
      getOrdersLambdaName,
      getUnimindLambdaName,
      getOrdersReservedConcurrency,
    } = props
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
                [{ expression: '(gor5xx/gor) * 100', label: 'GetOrders5XXErrorRate', id: 'r31', region, stat: 'Sum' }],
                [{ expression: '(gor4xx/gor) * 100', label: 'GetOrders4XXErrorRate', id: 'r41', region, stat: 'Sum' }],
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
              query: `SOURCE '/aws/lambda/${orderStatusLambdaName}' | fields orderInfo.orderHash as orderHash, orderInfo.tokenInChainId as chainId, orderInfo.offerer as offerer,orderInfo.exclusiveFiller as exclusiveFiller, orderInfo.filler as filler, orderInfo.tokenOut as tokenOut, orderInfo.amountOut as amountOut, orderInfo.blockNumber as blockNumber, orderInfo.txHash as txHash, orderInfo.fillBlock as fillBlock, orderInfo.gasUsed as gasUsed, orderInfo.gasCostInETH as gasCostInEth\n| filter ispresent(orderInfo.orderStatus) and orderInfo.orderStatus = 'filled'\n| sort @timestamp desc`,
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
            y: 44,
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
            y: 50,
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
            y: 56,
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
            y: 38,
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
            y: 38,
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
            y: 62,
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
            y: 62,
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
            height: 6,
            width: 12,
            y: 68,
            x: 0,
            type: 'metric',
            properties: {
              metrics: _.flatMap(SUPPORTED_CHAINS, (chainId) => [
                ['Uniswap', `NotificationOrderStaleness-chain-${chainId}`, 'Service', `UniswapXService`],
                ['.', '.', '.', `.`, { stat: 'p99' }],
                ['.', '.', '.', `.`, { stat: 'p50' }],
                ['.', '.', '.', `.`, { stat: 'Average' }],
              ]),
              view: 'timeSeries',
              region,
              title: 'DutchV2 Notification Order Staleness',
              period: 300,
              stat: 'p90',
            },
          },
          {
            height: 6,
            width: 12,
            y: 68,
            x: 12,
            type: 'metric',
            properties: {
              metrics: _.flatMap(SUPPORTED_CHAINS, (chainId) => [
                ['Uniswap', `NotificationStaleOrder-chain-${chainId}`, 'Service', `UniswapXService`],
              ]),
              view: 'timeSeries',
              region,
              title: 'DutchV2 Notification Stale Order Count',
              period: 300,
              stat: 'Sum',
            },
          },
          {
            height: 6,
            width: 12,
            y: 74,
            x: 0,
            type: 'metric',
            properties: {
              metrics: _.flatMap(SUPPORTED_CHAINS, (chainId) => [
                ['Uniswap', `NotificationRecordStaleness-chain-${chainId}`, 'Service', `UniswapXService`],
                ['.', '.', '.', `.`, { stat: 'p99' }],
                ['.', '.', '.', `.`, { stat: 'p50' }],
                ['.', '.', '.', `.`, { stat: 'Average' }],
              ]),
              view: 'timeSeries',
              region,
              title: 'DutchV2 Notification Record Staleness',
              period: 300,
              stat: 'p90',
            },
          },
          // --- Get Orders cache and capacity ---
          // The get-orders query cache is per execution environment, so DynamoDB reads on a
          // hot partition scale with environment count; these widgets show the hit rate, how
          // much traffic bypasses the cache, whether partitions have outgrown one page, and the
          // three ceilings that contain a throttle spiral: reserved concurrency, GSI throttles
          // and the WAF rate rule.
          {
            height: 1,
            width: 24,
            y: 80,
            x: 0,
            type: 'text',
            properties: {
              markdown: '# Get Orders Cache & Capacity',
            },
          },
          {
            height: 6,
            width: 12,
            y: 81,
            x: 0,
            type: 'metric',
            properties: {
              metrics: [
                [{ expression: '100 * goh / (goh + gom)', label: 'GetOrders hit rate %', id: 'gohr', region }],
                [{ expression: '100 * gloh / (gloh + glom)', label: 'GetLimitOrders hit rate %', id: 'glohr', region }],
                [
                  METRIC_NAMESPACE,
                  'GetOrdersQueryCacheHit',
                  'Service',
                  'UniswapXService',
                  { id: 'goh', visible: false, region },
                ],
                ['.', 'GetOrdersQueryCacheMiss', '.', '.', { id: 'gom', visible: false, region }],
                ['.', 'GetLimitOrdersQueryCacheHit', '.', '.', { id: 'gloh', visible: false, region }],
                ['.', 'GetLimitOrdersQueryCacheMiss', '.', '.', { id: 'glom', visible: false, region }],
              ],
              view: 'timeSeries',
              stacked: false,
              region,
              stat: 'Sum',
              period: 300,
              title: 'Query Cache Hit Rate | 5min',
              yAxis: { left: { min: 0, max: 100 } },
            },
          },
          {
            height: 6,
            width: 12,
            y: 81,
            x: 12,
            type: 'metric',
            properties: {
              // Miss = one DynamoDB read of a cached partition. Uncacheable = a read that
              // bypassed the cache (cursor, sort, or a caller-keyed partition). BaseTruncated =
              // a filler/swapper query that fell back to its own GSI because the partition no
              // longer fits one page.
              metrics: [
                [METRIC_NAMESPACE, 'GetOrdersQueryCacheHit', 'Service', 'UniswapXService', { label: 'GetOrders Hit' }],
                ['.', 'GetOrdersQueryCacheMiss', '.', '.', { label: 'GetOrders Miss' }],
                ['.', 'GetOrdersQueryCacheUncacheable', '.', '.', { label: 'GetOrders Uncacheable' }],
                ['.', 'GetOrdersQueryCacheBaseTruncated', '.', '.', { label: 'GetOrders BaseTruncated' }],
                ['.', 'GetLimitOrdersQueryCacheHit', '.', '.', { label: 'GetLimitOrders Hit' }],
                ['.', 'GetLimitOrdersQueryCacheMiss', '.', '.', { label: 'GetLimitOrders Miss' }],
                ['.', 'GetLimitOrdersQueryCacheUncacheable', '.', '.', { label: 'GetLimitOrders Uncacheable' }],
              ],
              view: 'timeSeries',
              stacked: false,
              region,
              stat: 'Sum',
              period: 300,
              title: 'Query Cache Reads by Outcome | 5min',
            },
          },
          {
            height: 6,
            width: 8,
            y: 87,
            x: 0,
            type: 'metric',
            properties: {
              // Distinct live keys in one execution environment. Bounded by the enum-keyed
              // partitions (statuses x chains); a climb here means the key space leaked.
              metrics: [
                [METRIC_NAMESPACE, 'GetOrdersQueryCacheSize', 'Service', 'UniswapXService', { label: 'GetOrders' }],
                ['.', 'GetLimitOrdersQueryCacheSize', '.', '.', { label: 'GetLimitOrders' }],
              ],
              view: 'timeSeries',
              stacked: false,
              region,
              stat: 'Maximum',
              period: 300,
              title: 'Query Cache Live Keys per Environment (max)',
            },
          },
          {
            height: 6,
            width: 8,
            y: 87,
            x: 8,
            type: 'metric',
            properties: {
              // Truncated: a cached partition held more rows than one page, so the single-page
              // contract is hiding rows. Alarm-worthy for open partitions.
              metrics: [
                [
                  METRIC_NAMESPACE,
                  'GetOrdersQueryCacheTruncated',
                  'Service',
                  'UniswapXService',
                  { label: 'GetOrders Truncated' },
                ],
                ['.', 'GetOrdersQueryCacheCapacityEviction', '.', '.', { label: 'GetOrders CapacityEviction' }],
                ['.', 'GetLimitOrdersQueryCacheTruncated', '.', '.', { label: 'GetLimitOrders Truncated' }],
                [
                  '.',
                  'GetLimitOrdersQueryCacheCapacityEviction',
                  '.',
                  '.',
                  { label: 'GetLimitOrders CapacityEviction' },
                ],
              ],
              view: 'timeSeries',
              stacked: false,
              region,
              stat: 'Sum',
              period: 300,
              title: 'Query Cache Truncated Pages & Capacity Evictions | 5min',
            },
          },
          {
            height: 6,
            width: 8,
            y: 87,
            x: 16,
            type: 'metric',
            properties: {
              metrics: [
                [
                  'AWS/Lambda',
                  'ConcurrentExecutions',
                  'FunctionName',
                  getOrdersLambdaName,
                  { stat: 'Maximum', label: 'Concurrent executions (max)' },
                ],
                ['.', 'Throttles', '.', '.', { stat: 'Sum', label: 'Throttles', yAxis: 'right' }],
              ],
              view: 'timeSeries',
              stacked: false,
              region,
              stat: 'Maximum',
              period: 60,
              title: 'Get Orders Lambda Concurrency & Throttles',
              ...(getOrdersReservedConcurrency !== undefined && {
                annotations: {
                  horizontal: [{ label: 'Reserved concurrency', value: getOrdersReservedConcurrency }],
                },
              }),
            },
          },
          {
            height: 6,
            width: 8,
            y: 93,
            x: 0,
            type: 'metric',
            properties: {
              metrics: [
                [
                  'AWS/DynamoDB',
                  'ConsumedReadCapacityUnits',
                  'TableName',
                  TABLE_NAMES.Orders,
                  'GlobalSecondaryIndexName',
                  CHAIN_STATUS_GSI,
                  { label: 'Orders chainId_orderStatus' },
                ],
                ['.', '.', '.', '.', '.', STATUS_GSI, { label: 'Orders orderStatus' }],
                [
                  '.',
                  '.',
                  '.',
                  TABLE_NAMES.LimitOrders,
                  '.',
                  CHAIN_STATUS_GSI,
                  { label: 'LimitOrders chainId_orderStatus' },
                ],
                ['.', '.', '.', '.', '.', STATUS_GSI, { label: 'LimitOrders orderStatus' }],
              ],
              view: 'timeSeries',
              stacked: false,
              region,
              stat: 'Sum',
              period: 300,
              title: 'Hot GSI Consumed Read Capacity | 5min',
            },
          },
          {
            height: 6,
            width: 8,
            y: 93,
            x: 8,
            type: 'metric',
            properties: {
              // The failure this whole section exists to prevent.
              metrics: [
                [
                  'AWS/DynamoDB',
                  'ReadThrottleEvents',
                  'TableName',
                  TABLE_NAMES.Orders,
                  'GlobalSecondaryIndexName',
                  CHAIN_STATUS_GSI,
                  { label: 'Orders chainId_orderStatus' },
                ],
                ['.', '.', '.', '.', '.', STATUS_GSI, { label: 'Orders orderStatus' }],
                [
                  '.',
                  '.',
                  '.',
                  TABLE_NAMES.LimitOrders,
                  '.',
                  CHAIN_STATUS_GSI,
                  { label: 'LimitOrders chainId_orderStatus' },
                ],
                ['.', '.', '.', '.', '.', STATUS_GSI, { label: 'LimitOrders orderStatus' }],
              ],
              view: 'timeSeries',
              stacked: false,
              region,
              stat: 'Sum',
              period: 300,
              title: 'Hot GSI Read Throttles | 5min',
            },
          },
          {
            height: 6,
            width: 8,
            y: 93,
            x: 16,
            type: 'metric',
            properties: {
              // WAF only counts a request under a rule's metric when the rule matches, and for a
              // block rule that means blocked, so there is no per-rule "allowed" series. The
              // service's own request count is the denominator instead: requests that got through.
              metrics: [
                [
                  'AWS/WAFV2',
                  'BlockedRequests',
                  'WebACL',
                  `${SERVICE_NAME}IPThrottling`,
                  'Rule',
                  'ip-get-orders',
                  'Region',
                  region,
                  { label: 'ip-get-orders blocked' },
                ],
                [
                  METRIC_NAMESPACE,
                  'GetOrdersRequest',
                  'Service',
                  'UniswapXService',
                  { label: 'GetOrders requests served' },
                ],
              ],
              view: 'timeSeries',
              stacked: false,
              region,
              stat: 'Sum',
              period: 300,
              title: 'WAF ip-get-orders Blocked vs Requests Served | 5min',
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

    new aws_cloudwatch.CfnDashboard(this, `UnimindDashboard`, {
      dashboardName: `UnimindDashboard`,
      dashboardBody: JSON.stringify({
        periodOverride: 'inherit',
        widgets: [
          {
            height: 6,
            width: 12,
            y: 0,
            x: 0,
            type: 'metric',
            properties: {
              metrics: [
                ['Uniswap', 'GetUnimindRequest', 'Service', 'UniswapXService'],
                ['.', 'GetUnimindStatus2XX', '.', '.'],
                ['.', 'GetUnimindStatus4XX', '.', '.'],
                ['.', 'GetUnimindStatus5XX', '.', '.'],
              ],
              view: 'timeSeries',
              stacked: false,
              region,
              stat: 'Sum',
              period: 300,
              title: 'Unimind Requests/Responses',
              yAxis: {
                left: {
                  showUnits: true,
                  label: 'Count',
                },
              },
            },
          },
          {
            height: 6,
            width: 12,
            y: 0,
            x: 12,
            type: 'metric',
            properties: {
              metrics: [
                [
                  'Uniswap',
                  'final-parameters-calculation-time',
                  'Service',
                  'UniswapXService',
                  { label: 'Final Parameters Calculation Time' },
                ],
                [
                  'Uniswap',
                  'unimind-parameters-update-time',
                  'Service',
                  'UniswapXServiceCron',
                  { label: 'Unimind Parameters Update Time' },
                ],
              ],
              view: 'timeSeries',
              stacked: false,
              region,
              stat: 'Average',
              period: 300,
              title: 'Unimind Calculation Times (ms)',
              yAxis: {
                left: {
                  showUnits: true,
                  label: 'Milliseconds',
                },
              },
            },
          },
          {
            height: 6,
            width: 12,
            y: 6,
            x: 0,
            type: 'log',
            properties: {
              region,
              title: 'Percentage of Orders with Negative π',
              view: 'table',
              query: `SOURCE '/aws/lambda/${getUnimindLambdaName}'
                | filter eventType = "UnimindPiCalculated"
                | stats sum(pi <= 0) as negCount, count(*) as totalCount by bin(1d)
                | fields (negCount/totalCount)*100 as negativePiPercentage`,
            },
          },
          {
            height: 6,
            width: 12,
            y: 6,
            x: 12,
            type: 'metric',
            properties: {
              metrics: [
                ['Uniswap', 'UnimindPiValue', 'Service', 'UniswapXService', { stat: 'Minimum', label: 'Min' }],
                ['.', '.', '.', '.', { stat: 'p10.0', label: 'p10' }],
                ['.', '.', '.', '.', { stat: 'p25.0', label: 'p25' }],
                ['.', '.', '.', '.', { stat: 'p50.0', label: 'p50 (median)' }],
                ['.', '.', '.', '.', { stat: 'p75.0', label: 'p75' }],
                ['.', '.', '.', '.', { stat: 'p90.0', label: 'p90' }],
                ['.', '.', '.', '.', { stat: 'p99.0', label: 'p99' }],
                ['.', '.', '.', '.', { stat: 'Maximum', label: 'Max' }],
                ['.', '.', '.', '.', { stat: 'Average', label: 'Average' }],
                ['.', '.', '.', '.', { stat: 'SampleCount', label: 'Count', visible: false }],
              ],
              view: 'timeSeries',
              stacked: false,
              region,
              period: 1800,
              title: 'Pi Value Distribution (Percentiles)',
              yAxis: {
                left: {
                  showUnits: false,
                  label: 'Pi Value (bps)',
                },
              },
            },
          },
          {
            height: 6,
            width: 24,
            y: 12,
            x: 0,
            type: 'log',
            properties: {
              query: `SOURCE '/aws/lambda/${getUnimindLambdaName}'
                | filter eventType = "UnimindPiCalculated"
                | fields if(pi < -15, -15,
                            if(pi > 15, 15,
                              round(pi))) as bucket
                | stats count() as n by bucket
                | sort bucket asc`,
              region,
              stacked: false,
              view: 'bar',
              title: 'Pi Value Histogram (1 bps buckets, -15 to +15 range)',
            },
          },
        ],
      }),
    })
  }
}
