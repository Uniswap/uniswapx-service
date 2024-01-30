import { Metrics } from '@aws-lambda-powertools/metrics'
import { SERVICE_NAME } from '../bin/constants'

export const powertoolsMetric = new Metrics({ namespace: 'Uniswapx', serviceName: SERVICE_NAME })
