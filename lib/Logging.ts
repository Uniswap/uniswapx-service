import { default as Logger } from 'bunyan'
import { SERVICE_NAME } from '../bin/constants'

export const log = new Logger({
  name: SERVICE_NAME,
})
