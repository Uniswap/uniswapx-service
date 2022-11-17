import * as cdk from 'aws-cdk-lib'
import { CfnOutput, SecretValue, Stack, StackProps, Stage, StageProps } from 'aws-cdk-lib'
import { BuildEnvironmentVariableType, BuildSpec } from 'aws-cdk-lib/aws-codebuild'
import * as sm from 'aws-cdk-lib/aws-secretsmanager'
import { CodeBuildStep, CodePipeline, CodePipelineSource } from 'aws-cdk-lib/pipelines'
import { Construct } from 'constructs'
import dotenv from 'dotenv'
import 'source-map-support/register'
import { SupportedChains } from '../lib/util/chains'
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
    const { provisionedConcurrency, chatbotSNSArn, stage } = props

    const { url } = new APIStack(this, `${SERVICE_NAME}API`, {
      provisionedConcurrency,
      chatbotSNSArn,
      stage,
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
        //'yarn add https://${GH_TOKEN}@github.com/Uniswap/gouda-sdk.git',
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

    const rpcTenderly = sm.Secret.fromSecretAttributes(this, 'rpcTenderly', {
      secretCompleteArn: 'arn:aws:secretsmanager:us-east-2:644039819003:secret:gouda-api-rpc-tenderly-Jh1BNl',
    })

    const jsonRpcUrls: { [chain: string]: string } = {}
    Object.values(SupportedChains).forEach((chainId) => {
      const key = `WEB3_RPC_${chainId}`
      jsonRpcUrls[key] = jsonRpcProvidersSecret.secretValueFromJson(key).toString()
    })

    jsonRpcUrls[`WEB3_RPC_TENDERLY`] = rpcTenderly.secretValueFromJson('RPC_TENDERLY').toString()

    // Beta us-east-2
    const betaUsEast2Stage = new APIStage(this, 'beta-us-east-2', {
      env: { account: '321377678687', region: 'us-east-2' },
      provisionedConcurrency: 20,
      stage: STAGE.BETA,
    })

    const betaUsEast2AppStage = pipeline.addStage(betaUsEast2Stage)

    this.addIntegTests(code, betaUsEast2Stage, betaUsEast2AppStage)

    // Prod us-east-2
    const prodUsEast2Stage = new APIStage(this, 'prod-us-east-2', {
      env: { account: '316116520258', region: 'us-east-2' },
      provisionedConcurrency: 100,
      chatbotSNSArn: 'arn:aws:sns:us-east-2:644039819003:SlackChatbotTopic',
      stage: STAGE.PROD,
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

Object.values(SupportedChains).forEach((chainId) => {
  envVars[`WEB3_RPC_${chainId}`] = process.env[`RPC_${chainId}`] || ''
})

envVars['WEB3_RPC_TENDERLY'] = process.env[`RPC_TENDERLY`] || ''
envVars['REACTOR_TENDERLY'] = process.env[`REACTOR_TENDERLY`] || ''
envVars['QUOTER_TENDERLY'] = process.env[`QUOTER_TENDERLY`] || ''
envVars['PERMIT_TENDERLY'] = process.env[`PERMIT_TENDERLY`] || ''

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
