import { OrderValidator as OnChainOrderValidator } from '@uniswap/uniswapx-sdk'
import { DynamoDB } from 'aws-sdk'
import { log } from '../../Logging'
import { checkDefined } from '../../preconditions/preconditions'
import { S3WebhookConfigurationProvider } from '../../providers/s3-webhook-provider'
import { AnalyticsService } from '../../services/analytics-service'
import { BETA_WEBHOOK_CONFIG_KEY, PRODUCTION_WEBHOOK_CONFIG_KEY, WEBHOOK_CONFIG_BUCKET } from '../../util/constants'
import { cosignersFromEnv } from '../../util/cosigners'
import { OffChainUniswapXOrderValidator } from '../../util/OffChainUniswapXOrderValidator'
import { STAGE } from '../../util/stage'
import { OnChainValidatorMap } from '../OnChainValidatorMap'
import { LazyProviderMap } from '../shared'
import { buildPostOrderHandler } from './build'
import { PostOrderHandler } from './handler'
import { PostRoutePolicy } from './policy'

// A post Lambda as deployed: its dependencies built once, at cold start, from the environment.
export function buildPostOrderLambda(policy: PostRoutePolicy): PostOrderHandler {
  const providerMap = new LazyProviderMap()
  return buildPostOrderHandler(policy, {
    orderValidator: new OffChainUniswapXOrderValidator({
      getCurrentTime: () => new Date().getTime() / 1000,
      deadlineValidityPeriodSeconds: policy.deadlineValidityPeriodSeconds,
      ...cosignersFromEnv(),
      skipDecayStartTimeValidation: policy.skipDecayStartTimeValidation,
    }),
    onChainValidatorMap: new OnChainValidatorMap<OnChainOrderValidator>(
      [],
      (chainId) => new OnChainOrderValidator(providerMap.get(chainId), chainId)
    ),
    repository: policy.createRepository(new DynamoDB.DocumentClient()),
    logger: log,
    analytics: AnalyticsService.create(),
    providerMap,
    webhookProvider: policy.notifyExclusiveFiller ? webhookProviderForStage() : undefined,
  })
}

function webhookProviderForStage(): S3WebhookConfigurationProvider {
  const stage = checkDefined(process.env['stage'], 'stage should be defined in the .env')
  const s3Key = stage === STAGE.BETA ? BETA_WEBHOOK_CONFIG_KEY : PRODUCTION_WEBHOOK_CONFIG_KEY
  return new S3WebhookConfigurationProvider(`${WEBHOOK_CONFIG_BUCKET}-${stage}-1`, s3Key)
}
