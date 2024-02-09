import awssdk from 'aws-sdk'
import { HEALTH_CHECK_PORT } from '../../bin/constants'
import { log } from '../Logging'
import { LimitOrdersRepository } from '../repositories/limit-orders-repository'
import { HealthCheckServer } from './healthcheck'
import { OnChainStatusChecker } from './OnChainStatusChecker'
const { DynamoDB } = awssdk

async function start() {
  await new HealthCheckServer(HEALTH_CHECK_PORT).listen()
  let limitOrdersDb = LimitOrdersRepository.create(new DynamoDB.DocumentClient())
  await new OnChainStatusChecker(limitOrdersDb).checkStatus()
}

start().then(() => {
  log.info('started')
})
