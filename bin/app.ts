import * as cdk from 'aws-cdk-lib'
import { CfnOutput, SecretValue, Stack, StackProps, Stage, StageProps } from 'aws-cdk-lib'
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
import { SERVICE_NAME } from './constants'
import { APIStack } from './stacks/api-stack'

dotenv.config()

export class APIStage extends Stage {
  public readonly url: CfnOutput

  constructor(
    scope: Construct,
    id: string,
    props: StageProps & {
      provisionedConcurrency: number
      chatbotSNSArn?: string
      stage: string
      envVars: { [key: string]: string }
    }
  ) {
    super(scope, id, props)
    const { provisionedConcurrency, chatbotSNSArn, stage, env, envVars } = props

    const { url } = new APIStack(this, `${SERVICE_NAME}API`, {
      throttlingOverride: envVars.THROTTLE_PER_FIVE_MINS,
      env,
      provisionedConcurrency,
      chatbotSNSArn,
      stage,
      envVars,
    })
    this.url = url
  }
}

export class APIPipeline extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props)

    const code = CodePipelineSource.gitHub('Uniswap/gouda-service', 'main', {
      authentication: SecretValue.secretsManager('github-token-2'),
    })

    const synthStep = new CodeBuildStep('Synth', {
      input: code,
      buildEnvironment: {
        buildImage: cdk.aws_codebuild.LinuxBuildImage.STANDARD_6_0,
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
            value: '3',
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
        phases: {
          install: {
            'runtime-versions': {
              nodejs: '16',
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
      stage: STAGE.BETA,
      envVars: {
        ...jsonRpcUrls,
        QUOTER_TENDERLY: tenderlySecrets.secretValueFromJson('QUOTER_TENDERLY').toString(),
        DL_REACTOR_TENDERLY: tenderlySecrets.secretValueFromJson('DL_REACTOR_TENDERLY').toString(),
        PERMIT2_TENDERLY: tenderlySecrets.secretValueFromJson('PERMIT2_TENDERLY').toString(),
        FILL_EVENT_DESTINATION_ARN: resourceArnSecret.secretValueFromJson('FILL_EVENT_DESTINATION_ARN_BETA').toString(),
        POSTED_ORDER_DESTINATION_ARN: resourceArnSecret.secretValueFromJson('POSTED_ORDER_DESTINATION_BETA').toString(),
        THROTTLE_PER_FIVE_MINS: '3000',
      },
    })

    const betaUsEast2AppStage = pipeline.addStage(betaUsEast2Stage)

    this.addIntegTests(code, betaUsEast2Stage, betaUsEast2AppStage, STAGE.BETA)

    // Prod us-east-2
    const prodUsEast2Stage = new APIStage(this, 'prod-us-east-2', {
      env: { account: '316116520258', region: 'us-east-2' },
      provisionedConcurrency: 5,
      chatbotSNSArn: 'arn:aws:sns:us-east-2:644039819003:SlackChatbotTopic',
      stage: STAGE.PROD,
      envVars: {
        ...jsonRpcUrls,
        FILL_EVENT_DESTINATION_ARN: resourceArnSecret.secretValueFromJson('FILL_EVENT_DESTINATION_ARN_PROD').toString(),
        POSTED_ORDER_DESTINATION_ARN: resourceArnSecret.secretValueFromJson('POSTED_ORDER_DESTINATION_PROD').toString(),
        THROTTLE_PER_FIVE_MINS: '3000',
      },
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
        buildImage: cdk.aws_codebuild.LinuxBuildImage.STANDARD_6_0,
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
          GOUDA_SERVICE_URL: {
            value: `${stage}/gouda-service/url`,
            type: BuildEnvironmentVariableType.SECRETS_MANAGER,
          },
          INTEG_TEST_RPC: {
            value: 'all/gouda-service/integ-test-rpc',
            type: BuildEnvironmentVariableType.SECRETS_MANAGER,
          },
          TEST_WALLET_PK: {
            value: 'all/gouda-service/test-wallet-pk',
            type: BuildEnvironmentVariableType.SECRETS_MANAGER,
          },
          TEST_FILLER_PK: {
            value: 'all/gouda-service/test-filler-pk',
            type: BuildEnvironmentVariableType.SECRETS_MANAGER,
          }
        },
      },
      commands: [
        'git config --global url."https://${GH_TOKEN}@github.com/".insteadOf ssh://git@github.com/',
        'echo "//registry.npmjs.org/:_authToken=${NPM_TOKEN}" > .npmrc',
        'echo "UNISWAP_API=${UNISWAP_API}" > .env',
        'echo "RPC_5=${INTEG_TEST_RPC}" > .env',
        'echo "TEST_WALLET_PK=${TEST_WALLET_PK}" > .env',
        'echo "TEST_FILLER_PK=${TEST_FILLER_PK}" > .env',
        'yarn install --network-concurrency 1 --skip-integrity-check',
        'yarn build',
        'yarn run integ-test',
      ],
      partialBuildSpec: BuildSpec.fromObject({
        phases: {
          install: {
            'runtime-versions': {
              nodejs: '16',
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
envVars['DL_REACTOR_TENDERLY'] = process.env[`DL_REACTOR_TENDERLY`] || ''
envVars['QUOTER_TENDERLY'] = process.env[`QUOTER_TENDERLY`] || ''
envVars['PERMIT2_TENDERLY'] = process.env[`PERMIT2_TENDERLY`] || ''

envVars['FILL_EVENT_DESTINATION_ARN'] = process.env['FILL_EVENT_DESTINATION_ARN'] || ''
envVars['POSTED_ORDER_DESTINATION_ARN'] = process.env['POSTED_ORDER_DESTINATION'] || ''

new APIStack(app, `${SERVICE_NAME}Stack`, {
  provisionedConcurrency: process.env.PROVISION_CONCURRENCY ? parseInt(process.env.PROVISION_CONCURRENCY) : 0,
  throttlingOverride: process.env.THROTTLE_PER_FIVE_MINS,
  chatbotSNSArn: process.env.CHATBOT_SNS_ARN,
  stage: STAGE.LOCAL,
  envVars: envVars,
})

new APIPipeline(app, `${SERVICE_NAME}PipelineStack`, {
  env: { account: '644039819003', region: 'us-east-2' },
})
