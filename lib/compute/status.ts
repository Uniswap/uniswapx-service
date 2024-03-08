import { MetricUnits } from '@aws-lambda-powertools/metrics'
import awssdk from 'aws-sdk'
import { HEALTH_CHECK_PORT } from '../../bin/constants'
import { log } from '../Logging'
import { OnChainStatusCheckerMetricNames, powertoolsMetric as metrics } from '../Metrics'
import { LimitOrdersRepository } from '../repositories/limit-orders-repository'
import { HealthCheckServer } from './healthcheck'
import { OnChainStatusChecker } from './on-chain-status-checker'
const { DynamoDB } = awssdk

async function start() {
  await new HealthCheckServer(HEALTH_CHECK_PORT).listen()
  const limitOrdersDb = LimitOrdersRepository.create(new DynamoDB.DocumentClient())
  await new OnChainStatusChecker(limitOrdersDb).pollForOpenOrders()
}

start().then(
  () => {
    log.info('started')
  },
  (reject) => {
    log.error('OnChainStatusChecker-Startup Unsuccessful', { message: reject })
    metrics.singleMetric().addMetric(OnChainStatusCheckerMetricNames.LoopEnded, MetricUnits.Count, 1)
  }
)
