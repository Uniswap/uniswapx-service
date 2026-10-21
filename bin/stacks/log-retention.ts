import { RetentionDays } from 'aws-cdk-lib/aws-logs'
import { STAGE } from '../../lib/util/stage'

// Lives under bin/ on purpose: lib/ is bundled into the Lambda handlers, and any
// aws-cdk-lib import there drags the whole library into the runtime bundle.
export function logRetentionDays(stage: STAGE): RetentionDays {
  switch (stage) {
    case STAGE.PROD:
      return RetentionDays.THREE_MONTHS
    case STAGE.BETA:
      return RetentionDays.TWO_MONTHS
    default:
      return RetentionDays.ONE_MONTH
  }
}
