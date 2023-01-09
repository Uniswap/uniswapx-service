import * as cdk from 'aws-cdk-lib'
import { CfnOutput, SecretValue, Stack, StackProps, Stage, StageProps } from 'aws-cdk-lib'
import { BuildEnvironmentVariableType, BuildSpec, ComputeType } from 'aws-cdk-lib/aws-codebuild'
import * as sm from 'aws-cdk-lib/aws-secretsmanager'
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
      envVars?: { [key: string]: string }
    }
  ) {
    super(scope, id, props)
    const { provisionedConcurrency, chatbotSNSArn, stage, env, envVars } = props

    const { url } = new APIStack(this, `${SERVICE_NAME}API`, {
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
        },
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
      secretCompleteArn: 'arn:aws:secretsmanager:us-east-2:644039819003:secret:gouda-service-rpc-urls-E4FbSb',
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
        V3_EXECUTOR_TENDERLY: tenderlySecrets.secretValueFromJson('V3_EXECUTOR_TENDERLY').toString(),
        PERMIT2_TENDERLY: tenderlySecrets.secretValueFromJson('PERMIT2_TENDERLY').toString(),
        QUOTE_REQUEST_FIREHOSE: resourceArnSecret.secretValueFromJson('QUOTE_REQUEST_FIREHOSE_BETA').toString(),
        FILL_EVENT_FIREHOSE: resourceArnSecret.secretValueFromJson('FILL_EVENT_FIREHOSE_BETA').toString(),
      },
    })

    const betaUsEast2AppStage = pipeline.addStage(betaUsEast2Stage)

    this.addIntegTests(code, betaUsEast2Stage, betaUsEast2AppStage)

    // Prod us-east-2
    const prodUsEast2Stage = new APIStage(this, 'prod-us-east-2', {
      env: { account: '316116520258', region: 'us-east-2' },
      provisionedConcurrency: 5,
      chatbotSNSArn: 'arn:aws:sns:us-east-2:644039819003:SlackChatbotTopic',
      stage: STAGE.PROD,
      envVars: {
        ...jsonRpcUrls,
        QUOTE_REQUEST_FIREHOSE: resourceArnSecret.secretValueFromJson('QUOTE_REQUEST_FIREHOSE_PROD').toString(),
        FILL_EVENT_FIREHOSE: resourceArnSecret.secretValueFromJson('FILL_EVENT_FIREHOSE_PROD').toString(),
      },
    })

    const prodUsEast2AppStage = pipeline.addStage(prodUsEast2Stage)
    this.addIntegTests(code, prodUsEast2Stage, prodUsEast2AppStage)
    pipeline.buildPipeline()
  }

  private addIntegTests(
    sourceArtifact: cdk.pipelines.CodePipelineSource,
    apiStage: APIStage,
    applicationStage: cdk.pipelines.StageDeployment
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
        },
      },
      commands: [
        'git config --global url."https://${GH_TOKEN}@github.com/".insteadOf ssh://git@github.com/',
        'echo "//registry.npmjs.org/:_authToken=${NPM_TOKEN}" > .yarnrc',
        'echo "UNISWAP_API=${UNISWAP_API}" > .env',
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
  envVars[`WEB3_RPC_${chainId}`] = process.env[`RPC_${chainId}`] || ''
})

envVars['RPC_TENDERLY'] = process.env[`RPC_TENDERLY`] || ''
envVars['DL_REACTOR_TENDERLY'] = process.env[`DL_REACTOR_TENDERLY`] || ''
envVars['QUOTER_TENDERLY'] = process.env[`QUOTER_TENDERLY`] || ''
envVars['PERMIT2_TENDERLY'] = process.env[`PERMIT2_TENDERLY`] || ''

envVars['FILL_EVENT_FIREHOSE'] = process.env['FIREHOSE_ARN_LOCAL'] || ''

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
