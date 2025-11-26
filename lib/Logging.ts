import { Logger } from '@aws-lambda-powertools/logger'
import { SERVICE_NAME } from '../bin/constants'

export const log = new Logger({
  serviceName: SERVICE_NAME,
})
