import { RetentionDays } from 'aws-cdk-lib/aws-logs'

export enum STAGE {
  BETA = 'beta',
  PROD = 'prod',
  LOCAL = 'local',
}

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
