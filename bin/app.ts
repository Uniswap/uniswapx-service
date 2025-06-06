import * as cdk from 'aws-cdk-lib'
import { CfnOutput, Stack, StackProps, Stage, StageProps } from 'aws-cdk-lib'
import * as chatbot from 'aws-cdk-lib/aws-chatbot'
import { BuildEnvironmentVariableType, BuildSpec, ComputeType } from 'aws-cdk-lib/aws-codebuild'
import * as sm from 'aws-cdk-lib/aws-secretsmanager'

import { PipelineNotificationEvents } from 'aws-cdk-lib/aws-codepipeline'
import { CodeBuildStep, CodePipeline, CodePipelineSource } from 'aws-cdk-lib/pipelines'
import { Construct } from 'constructs'
import dotenv from 'dotenv'
import 'source-map-support/register'
import { SUPPORTED_CHAINS } from '../lib/util/chain'
import { STAGE } from '../lib/util/stage'
import { PROD_TABLE_CAPACITY } from './config'
import { SERVICE_NAME } from './constants'
import { APIStack } from './stacks/api-stack'
import { IndexCapacityConfig, TableCapacityConfig } from './stacks/dynamo-stack'

dotenv.config()

export class APIStage extends Stage {
  public readonly url: CfnOutput

  constructor(
    scope: Construct,
    id: string,
    props: StageProps & {
      provisionedConcurrency: number
      chatbotSNSArn?: string
      internalApiKey?: string
      stage: string
      envVars: { [key: string]: string }
      tableCapacityConfig: TableCapacityConfig
      indexCapacityConfig?: IndexCapacityConfig
    }
  ) {
    super(scope, id, props)
    const {
      provisionedConcurrency,
      chatbotSNSArn,
      internalApiKey,
      stage,
      env,
      envVars,
      tableCapacityConfig,
      indexCapacityConfig,
    } = props

    const { url } = new APIStack(this, `${SERVICE_NAME}API`, {
      throttlingOverride: envVars.THROTTLE_PER_FIVE_MINS,
      env,
      provisionedConcurrency,
      internalApiKey,
      chatbotSNSArn,
      stage,
      envVars,
      tableCapacityConfig,
      indexCapacityConfig,
    })
    this.url = url
  }
}

export class APIPipeline extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props)

    const code = CodePipelineSource.connection('Uniswap/uniswapx-service', 'main', {
      connectionArn:
        'arn:aws:codestar-connections:us-east-2:644039819003:connection/4806faf1-c31e-4ea2-a5bf-c6fc1fa79487',
    })

    const synthStep = new CodeBuildStep('Synth', {
      input: code,
      buildEnvironment: {
        buildImage: cdk.aws_codebuild.LinuxBuildImage.STANDARD_7_0,
        environmentVariables: {
          NPM_TOKEN: {
            value: 'npm-private-repo-access-token',
            type: BuildEnvironmentVariableType.SECRETS_MANAGER,
          },
          GH_TOKEN: {
            value: 'github-token-2',
            type: BuildEnvironmentVariableType.SECRETS_MANAGER,
          },
          VERSION: {
            value: '2',
            type: BuildEnvironmentVariableType.PLAINTEXT,
          },
        },
        computeType: ComputeType.LARGE,
      },
      commands: [
        'git config --global url."https://${GH_TOKEN}@github.com/".insteadOf ssh://git@github.com/',
        'echo "//registry.npmjs.org/:_authToken=${NPM_TOKEN}" > .npmrc',
        'yarn install --network-concurrency 1 --skip-integrity-check --check-cache',
        'yarn build',
        'npx cdk synth',
      ],
      partialBuildSpec: BuildSpec.fromObject({
        // v0.2 runs all commands in the same context
        version: '0.2',
        phases: {
          install: {
            'runtime-versions': {
              nodejs: '18',
            },
          },
        },
      }),
    })

    const pipeline = new CodePipeline(this, `${SERVICE_NAME}Pipeline`, {
      // The pipeline name
      pipelineName: `${SERVICE_NAME}`,
      crossAccountKeys: true,
      synth: synthStep,
      selfMutation: true,
      selfMutationCodeBuildDefaults: {
        buildEnvironment: {
          buildImage: cdk.aws_codebuild.LinuxBuildImage.STANDARD_7_0,
        },
        partialBuildSpec: BuildSpec.fromObject({
          version: '0.2',
          phases: {
            install: {
              'runtime-versions': {
                nodejs: '18',
              },
            },
          },
        }),
      },
    })

    // Secrets are stored in secrets manager in the pipeline account. Accounts we deploy to
    // have been granted permissions to access secrets via resource policies.
    const jsonRpcProvidersSecret = sm.Secret.fromSecretAttributes(this, 'RPCProviderUrls', {
      secretCompleteArn: 'arn:aws:secretsmanager:us-east-2:644039819003:secret:gouda-service-rpc-urls-2-9spgjc',
    })

    const tenderlySecrets = sm.Secret.fromSecretAttributes(this, 'rpcTenderly', {
      secretCompleteArn: 'arn:aws:secretsmanager:us-east-2:644039819003:secret:gouda-api-rpc-tenderly-Jh1BNl',
    })

    const resourceArnSecret = sm.Secret.fromSecretAttributes(this, 'firehoseArn', {
      secretCompleteArn: 'arn:aws:secretsmanager:us-east-2:644039819003:secret:gouda-resource-arns-wF51FW',
    })

    const internalApiKey = sm.Secret.fromSecretAttributes(this, 'internal-api-key', {
      secretCompleteArn: 'arn:aws:secretsmanager:us-east-2:644039819003:secret:uniswapx-internal-api-key-new-RaBmoM',
    })

    const labsCosignerBeta = sm.Secret.fromSecretAttributes(this, 'labs-cosigner-beta', {
      secretCompleteArn: 'arn:aws:secretsmanager:us-east-2:644039819003:secret:param-api/beta/cosignerAddress-gkPfRf',
    })

    const labsCosignerProd = sm.Secret.fromSecretAttributes(this, 'labs-cosigner-prod', {
      secretCompleteArn: 'arn:aws:secretsmanager:us-east-2:644039819003:secret:param-api/prod/cosignerAddress-tgNwAd',
    })

    const labsPriorityCosignerBeta = sm.Secret.fromSecretAttributes(this, 'labs-priority-cosigner-beta', {
      secretCompleteArn:
        'arn:aws:secretsmanager:us-east-2:644039819003:secret:beta-priority-labs-cosigner-address-cwej2J',
    })

    const labsPriorityCosignerProd = sm.Secret.fromSecretAttributes(this, 'labs-priority-cosigner-prod', {
      secretCompleteArn:
        'arn:aws:secretsmanager:us-east-2:644039819003:secret:prod-priority-labs-cosigner-address-iarU6E',
    })

    const jsonRpcUrls: { [chain: string]: string } = {}
    Object.values(SUPPORTED_CHAINS).forEach((chainId) => {
      const key = `RPC_${chainId}`
      jsonRpcUrls[key] = jsonRpcProvidersSecret.secretValueFromJson(key).toString()
    })

    new CfnOutput(this, 'jsonRpcUrls', {
      value: JSON.stringify(jsonRpcUrls),
    })

    // Beta us-east-2
    const betaUsEast2Stage = new APIStage(this, 'beta-us-east-2', {
      env: { account: '321377678687', region: 'us-east-2' },
      provisionedConcurrency: 2,
      internalApiKey: internalApiKey.secretValue.toString(),
      stage: STAGE.BETA,
      envVars: {
        ...jsonRpcUrls,
        QUOTER_TENDERLY: tenderlySecrets.secretValueFromJson('QUOTER_TENDERLY').toString(),
        DL_REACTOR_TENDERLY: tenderlySecrets.secretValueFromJson('DL_REACTOR_TENDERLY').toString(),
        PERMIT2_TENDERLY: tenderlySecrets.secretValueFromJson('PERMIT2_TENDERLY').toString(),
        FILL_EVENT_DESTINATION_ARN: resourceArnSecret.secretValueFromJson('FILL_EVENT_DESTINATION_ARN_BETA').toString(),
        ACTIVE_ORDER_EVENT_DESTINATION_ARN: resourceArnSecret
          .secretValueFromJson('ACTIVE_ORDER_EVENT_DESTINATION_ARN_BETA')
          .toString(),
        POSTED_ORDER_DESTINATION_ARN: resourceArnSecret.secretValueFromJson('POSTED_ORDER_DESTINATION_BETA').toString(),
        THROTTLE_PER_FIVE_MINS: '3000',
        REGION: 'us-east-2', //needed in checkOrderStatusHandler to kick off step function retries
        LABS_COSIGNER: labsCosignerBeta.secretValue.toString(),
        LABS_PRIORITY_COSIGNER: labsPriorityCosignerBeta.secretValue.toString(),
      },
      tableCapacityConfig: {
        order: { billingMode: cdk.aws_dynamodb.BillingMode.PAY_PER_REQUEST },
        limitOrder: { billingMode: cdk.aws_dynamodb.BillingMode.PAY_PER_REQUEST },
        relayOrder: { billingMode: cdk.aws_dynamodb.BillingMode.PAY_PER_REQUEST },
        nonce: { billingMode: cdk.aws_dynamodb.BillingMode.PAY_PER_REQUEST },
        quoteMetadata: { billingMode: cdk.aws_dynamodb.BillingMode.PAY_PER_REQUEST },
        unimindParameters: { billingMode: cdk.aws_dynamodb.BillingMode.PAY_PER_REQUEST },
      },
    })

    const betaUsEast2AppStage = pipeline.addStage(betaUsEast2Stage)

    this.addIntegTests(code, betaUsEast2Stage, betaUsEast2AppStage, STAGE.BETA)

    // Prod us-east-2
    const prodUsEast2Stage = new APIStage(this, 'prod-us-east-2', {
      env: { account: '316116520258', region: 'us-east-2' },
      provisionedConcurrency: 5,
      internalApiKey: internalApiKey.secretValue.toString(),
      chatbotSNSArn: 'arn:aws:sns:us-east-2:644039819003:SlackChatbotTopic',
      stage: STAGE.PROD,
      envVars: {
        ...jsonRpcUrls,
        FILL_EVENT_DESTINATION_ARN: resourceArnSecret.secretValueFromJson('FILL_EVENT_DESTINATION_ARN_PROD').toString(),
        ACTIVE_ORDER_EVENT_DESTINATION_ARN: resourceArnSecret
          .secretValueFromJson('ACTIVE_ORDER_EVENT_DESTINATION_ARN_PROD')
          .toString(),
        POSTED_ORDER_DESTINATION_ARN: resourceArnSecret.secretValueFromJson('POSTED_ORDER_DESTINATION_PROD').toString(),
        THROTTLE_PER_FIVE_MINS: '3000',
        REGION: 'us-east-2', //needed in checkOrderStatusHandler to kick off step function retries
        LABS_COSIGNER: labsCosignerProd.secretValue.toString(),
        LABS_PRIORITY_COSIGNER: labsPriorityCosignerProd.secretValue.toString(),
      },
      tableCapacityConfig: PROD_TABLE_CAPACITY,
    })

    const prodUsEast2AppStage = pipeline.addStage(prodUsEast2Stage)
    this.addIntegTests(code, prodUsEast2Stage, prodUsEast2AppStage, STAGE.PROD)

    pipeline.buildPipeline()

    const slackChannel = chatbot.SlackChannelConfiguration.fromSlackChannelConfigurationArn(
      this,
      'SlackChannel',
      'arn:aws:chatbot::644039819003:chat-configuration/slack-channel/eng-ops-protocols-slack-chatbot'
    )

    pipeline.pipeline.notifyOn('NotifySlack', slackChannel, {
      events: [PipelineNotificationEvents.PIPELINE_EXECUTION_FAILED],
    })
  }

  private addIntegTests(
    sourceArtifact: cdk.pipelines.CodePipelineSource,
    apiStage: APIStage,
    applicationStage: cdk.pipelines.StageDeployment,
    stage: STAGE
  ) {
    const testAction = new CodeBuildStep(`${SERVICE_NAME}-IntegTests-${apiStage.stageName}`, {
      projectName: `${SERVICE_NAME}-IntegTests-${apiStage.stageName}`,
      input: sourceArtifact,
      envFromCfnOutputs: {
        UNISWAP_API: apiStage.url,
      },
      buildEnvironment: {
        buildImage: cdk.aws_codebuild.LinuxBuildImage.STANDARD_7_0,
        computeType: ComputeType.MEDIUM,
        environmentVariables: {
          NPM_TOKEN: {
            value: 'npm-private-repo-access-token',
            type: BuildEnvironmentVariableType.SECRETS_MANAGER,
          },
          GH_TOKEN: {
            value: 'github-token-2',
            type: BuildEnvironmentVariableType.SECRETS_MANAGER,
          },
          UNISWAPX_SERVICE_URL: {
            value: `${stage}/gouda-service/url`,
            type: BuildEnvironmentVariableType.SECRETS_MANAGER,
          },
          URA_SERVICE_URL: {
            value: `${stage}/gouda-service/integ-test/ura_url`,
            type: BuildEnvironmentVariableType.SECRETS_MANAGER,
          },
          GPA_SERVICE_URL: {
            value: `${stage}/gouda-service/integ-test/gpa_url`,
            type: BuildEnvironmentVariableType.SECRETS_MANAGER,
          },
          COSIGNER_ADDRESS: {
            value: `${stage}/gouda-service/integ-test/cosigner`,
            type: BuildEnvironmentVariableType.SECRETS_MANAGER,
          },
          RPC_1: {
            value: 'all/gouda-service/integ-test/rpc',
            type: BuildEnvironmentVariableType.SECRETS_MANAGER,
          },
          TEST_WALLET_PK: {
            value: 'all/gouda-service/integ-test/test-wallet-pk',
            type: BuildEnvironmentVariableType.SECRETS_MANAGER,
          },
          TEST_FILLER_PK: {
            value: 'all/gouda-service/integ-test/test-filler-pk',
            type: BuildEnvironmentVariableType.SECRETS_MANAGER,
          },
        },
      },
      commands: [
        'git config --global url."https://${GH_TOKEN}@github.com/".insteadOf ssh://git@github.com/',
        'echo "//registry.npmjs.org/:_authToken=${NPM_TOKEN}" > .npmrc',
        'echo "UNISWAP_API=${UNISWAP_API}" > .env',
        'echo "URA_SERVICE_URL=${URA_SERVICE_URL}" > .env',
        'echo "GPA_SERVICE_URL=${GPA_SERVICE_URL}" > .env',
        'echo "COSIGNER_ADDRESS=${COSIGNER_ADDRESS}" > .env',
        'echo "RPC_1=${RPC_1}" > .env',
        'echo "TEST_WALLET_PK=${TEST_WALLET_PK}" > .env',
        'echo "TEST_FILLER_PK=${TEST_FILLER_PK}" > .env',
        'yarn install --network-concurrency 1 --skip-integrity-check',
        'yarn build',
        'yarn run test:e2e',
      ],
      partialBuildSpec: BuildSpec.fromObject({
        phases: {
          install: {
            'runtime-versions': {
              nodejs: '18',
            },
          },
        },
      }),
    })

    applicationStage.addPost(testAction)
  }
}

// Local Dev Stack
const app = new cdk.App()

// Local dev stack
const envVars: { [key: string]: string } = {}

Object.values(SUPPORTED_CHAINS).forEach((chainId) => {
  envVars[`RPC_${chainId}`] = process.env[`RPC_${chainId}`] || ''
})

envVars['RPC_TENDERLY'] = process.env[`RPC_TENDERLY`] || ''
envVars['RPC_1'] = process.env[`RPC_1`] || ''
envVars['RPC_8453'] = process.env[`RPC_8453`] || ''
envVars['RPC_130'] = process.env[`RPC_130`] || ''
envVars['DL_REACTOR_TENDERLY'] = process.env[`DL_REACTOR_TENDERLY`] || ''
envVars['QUOTER_TENDERLY'] = process.env[`QUOTER_TENDERLY`] || ''
envVars['PERMIT2_TENDERLY'] = process.env[`PERMIT2_TENDERLY`] || ''

envVars['FILL_EVENT_DESTINATION_ARN'] = process.env['FILL_EVENT_DESTINATION_ARN'] || ''
envVars['POSTED_ORDER_DESTINATION_ARN'] = process.env['POSTED_ORDER_DESTINATION'] || ''
envVars['LABS_COSIGNER'] = process.env['LABS_COSIGNER'] || ''
envVars['LABS_PRIORITY_COSIGNER'] = process.env['LABS_PRIORITY_COSIGNER'] || ''

new APIStack(app, `${SERVICE_NAME}Stack`, {
  provisionedConcurrency: process.env.PROVISION_CONCURRENCY ? parseInt(process.env.PROVISION_CONCURRENCY) : 0,
  throttlingOverride: process.env.THROTTLE_PER_FIVE_MINS,
  internalApiKey: 'test-api-key',
  chatbotSNSArn: process.env.CHATBOT_SNS_ARN,
  stage: STAGE.LOCAL,
  envVars: envVars,
  tableCapacityConfig: {
    order: { billingMode: cdk.aws_dynamodb.BillingMode.PAY_PER_REQUEST },
    limitOrder: { billingMode: cdk.aws_dynamodb.BillingMode.PAY_PER_REQUEST },
    relayOrder: { billingMode: cdk.aws_dynamodb.BillingMode.PAY_PER_REQUEST },
    nonce: { billingMode: cdk.aws_dynamodb.BillingMode.PAY_PER_REQUEST },
    quoteMetadata: { billingMode: cdk.aws_dynamodb.BillingMode.PAY_PER_REQUEST },
    unimindParameters: { billingMode: cdk.aws_dynamodb.BillingMode.PAY_PER_REQUEST },
  },
})

new APIPipeline(app, `${SERVICE_NAME}PipelineStack`, {
  env: { account: '644039819003', region: 'us-east-2' },
})
