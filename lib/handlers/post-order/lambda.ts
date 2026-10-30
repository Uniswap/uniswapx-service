import { KMSClient } from '@aws-sdk/client-kms'
import { KmsSigner } from '@uniswap/signer'
import { OrderValidator as OnChainOrderValidator } from '@uniswap/uniswapx-sdk'
import { DynamoDB } from 'aws-sdk'
import { checkDefined } from '../../preconditions/preconditions'
import { S3WebhookConfigurationProvider } from '../../providers/s3-webhook-provider'
import { AnalyticsService } from '../../services/analytics-service'
import {
  FirehosePostedOrderAnalytics,
  LogLinePostedOrderAnalytics,
  PostedOrderAnalytics,
} from '../../services/posted-order-analytics'
import { SfnStartTracking } from '../../services/start-tracking'
import { POSTED_ORDERS_STREAM_ENV } from '../../util/analytics-events'
import { BETA_WEBHOOK_CONFIG_KEY, PRODUCTION_WEBHOOK_CONFIG_KEY, WEBHOOK_CONFIG_BUCKET } from '../../util/constants'
import { cosignersFromEnv } from '../../util/cosigners'
import { OffChainUniswapXOrderValidator } from '../../util/OffChainUniswapXOrderValidator'
import { STAGE } from '../../util/stage'
import { getStateMachineArn } from '../../util/stateMachineArn'
import { OnChainValidatorMap } from '../OnChainValidatorMap'
import { LazyProviderMap } from '../shared'
import { sharedFirehoseRecordWriter } from '../shared/firehose'
import { sharedStartExecutionClient } from '../shared/sfn'
import { buildPostOrderHandler } from './build'
import { PostOrderHandler } from './handler'
import { PostRoutePolicy } from './policy'

// A post Lambda as deployed: its dependencies built once, at cold start, from the environment.
export function buildPostOrderLambda(policy: PostRoutePolicy): PostOrderHandler {
  const providerMap = new LazyProviderMap()
  const now = () => Date.now()
  return buildPostOrderHandler(policy, {
    orderValidator: new OffChainUniswapXOrderValidator({
      getCurrentTime: () => now() / 1000,
      deadlineValidityPeriodSeconds: policy.deadlineValidityPeriodSeconds,
      ...cosignersFromEnv(),
      skipDecayStartTimeValidation: policy.skipDecayStartTimeValidation,
    }),
    onChainValidatorMap: new OnChainValidatorMap<OnChainOrderValidator>(
      [],
      (chainId) => new OnChainOrderValidator(providerMap.get(chainId), chainId)
    ),
    repository: policy.createRepository(new DynamoDB.DocumentClient()),
    analytics: postedOrderAnalyticsFromEnv(),
    providerMap,
    startTracking: new SfnStartTracking(sharedStartExecutionClient, getStateMachineArn),
    createPriorityCosigner,
    now,
    webhookProvider: policy.notifyExclusiveFiller ? webhookProviderForStage() : undefined,
  })
}

// Straight to the delivery stream where the Lambda stack names one; else log lines (local stack).
function postedOrderAnalyticsFromEnv(): PostedOrderAnalytics {
  const streamName = process.env[POSTED_ORDERS_STREAM_ENV]
  return streamName
    ? new FirehosePostedOrderAnalytics(AnalyticsService.create(), streamName, sharedFirehoseRecordWriter)
    : new LogLinePostedOrderAnalytics(AnalyticsService.create())
}

// Read per priority order, not at cold start, so a missing key fails only priority posts.
function createPriorityCosigner(): KmsSigner {
  const kmsKeyId = checkDefined(process.env.KMS_KEY_ID, 'KMS_KEY_ID is not defined')
  const awsRegion = checkDefined(process.env.REGION, 'REGION is not defined')
  return new KmsSigner(new KMSClient({ region: awsRegion }), kmsKeyId)
}

function webhookProviderForStage(): S3WebhookConfigurationProvider {
  const stage = checkDefined(process.env['stage'], 'stage should be defined in the .env')
  const s3Key = stage === STAGE.BETA ? BETA_WEBHOOK_CONFIG_KEY : PRODUCTION_WEBHOOK_CONFIG_KEY
  return new S3WebhookConfigurationProvider(`${WEBHOOK_CONFIG_BUCKET}-${stage}-1`, s3Key)
}
