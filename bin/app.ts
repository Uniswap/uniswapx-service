import * as cdk from 'aws-cdk-lib'
import { CfnOutput, SecretValue, Stack, StackProps, Stage, StageProps } from 'aws-cdk-lib'
import * as chatbot from 'aws-cdk-lib/aws-chatbot'
import { BuildEnvironmentVariableType } from 'aws-cdk-lib/aws-codebuild'
import { PipelineNotificationEvents } from 'aws-cdk-lib/aws-codepipeline'
import * as sm from 'aws-cdk-lib/aws-secretsmanager'
import { CodeBuildStep, CodePipeline, CodePipelineSource } from 'aws-cdk-lib/pipelines'
import { Construct } from 'constructs'
import dotenv from 'dotenv'
import 'source-map-support/register'
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
      infuraProjectId: string
      provisionedConcurrency: number
      chatbotSNSArn?: string
      stage: string
    }
  ) {
    super(scope, id, props)
    const { infuraProjectId, provisionedConcurrency, chatbotSNSArn, stage } = props

    const { url } = new APIStack(this, `${SERVICE_NAME}API`, {
      infuraProjectId,
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
        environmentVariables: {
          NPM_TOKEN: {
            value: 'npm-private-repo-access-token',
            type: BuildEnvironmentVariableType.SECRETS_MANAGER,
          },
          SSH_KEY: {
            value: 'GOUDA_SDK_REPO_KEY',
            type: BuildEnvironmentVariableType.SECRETS_MANAGER,
          },
        },
      },
      commands: [
        'echo SSH_KEY',
        'echo TESTING DO COMMANDS CHANGE',
        'echo "${SSH_KEY}"',
        'mkdir -p ~/.ssh',
        'echo "${SSH_KEY}" > ~/.ssh/id_rsa',
        'chmod 600 ~/.ssh/id_rsa',
        'ssh-keygen -F github.com || ssh-keyscan github.com >>~/.ssh/known_hosts',
        'git config --global url."git@github.com:".insteadOf "https://github.com/"',
        'echo "//registry.npmjs.org/:_authToken=${NPM_TOKEN}" > .npmrc && yarn install --frozen-lockfile',
        'yarn build',
        'npx cdk synth',
      ],
    })

    const pipeline = new CodePipeline(this, `${SERVICE_NAME}Pipeline`, {
      // The pipeline name
      pipelineName: `${SERVICE_NAME}`,
      crossAccountKeys: true,
      synth: synthStep,
    })

    // Secrets are stored in secrets manager in the pipeline account. Accounts we deploy to
    // have been granted permissions to access secrets via resource policies.

    const infuraProjectId = sm.Secret.fromSecretAttributes(this, 'InfuraProjectId', {
      secretCompleteArn: 'arn:aws:secretsmanager:us-east-2:644039819003:secret:infuraProjectId-UlSwK2',
    })

    // Beta us-east-2
    const betaUsEast2Stage = new APIStage(this, 'beta-us-east-2', {
      env: { account: '321377678687', region: 'us-east-2' },
      provisionedConcurrency: 20,
      stage: STAGE.BETA,
      infuraProjectId: infuraProjectId.secretValue.toString(),
    })

    const betaUsEast2AppStage = pipeline.addStage(betaUsEast2Stage)

    this.addIntegTests(code, betaUsEast2Stage, betaUsEast2AppStage)

    // Prod us-east-2
    const prodUsEast2Stage = new APIStage(this, 'prod-us-east-2', {
      env: { account: '316116520258', region: 'us-east-2' },
      infuraProjectId: infuraProjectId.secretValue.toString(),
      provisionedConcurrency: 100,
      chatbotSNSArn: 'arn:aws:sns:us-east-2:644039819003:SlackChatbotTopic',
      stage: STAGE.PROD,
    })

    const prodUsEast2AppStage = pipeline.addStage(prodUsEast2Stage)

    this.addIntegTests(code, prodUsEast2Stage, prodUsEast2AppStage)

    const slackChannel = chatbot.SlackChannelConfiguration.fromSlackChannelConfigurationArn(
      this,
      'SlackChannel',
      'arn:aws:chatbot::644039819003:chat-configuration/slack-channel/eng-ops-slack-chatbot'
    )

    pipeline.buildPipeline()
    pipeline.pipeline.notifyOn('NotifySlack', slackChannel, {
      events: [PipelineNotificationEvents.PIPELINE_EXECUTION_FAILED],
    })
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
        environmentVariables: {
          NPM_TOKEN: {
            value: 'npm-private-repo-access-token',
            type: BuildEnvironmentVariableType.SECRETS_MANAGER,
          },
          SSH_KEY: {
            value: 'GOUDA_SDK_REPO_KEY',
            type: BuildEnvironmentVariableType.SECRETS_MANAGER,
          },
        },
      },
      commands: [
        'echo SSH_KEY',
        'echo TESTING DO COMMANDS CHANGE',
        'echo "${SSH_KEY}"',
        'mkdir -p ~/.ssh',
        'echo "${SSH_KEY}" > ~/.ssh/id_rsa',
        'chmod 600 ~/.ssh/id_rsa',
        'ssh-keygen -F github.com || ssh-keyscan github.com >>~/.ssh/known_hosts',
        'git config --global url."git@github.com:".insteadOf "https://github.com/"',
        'echo "//registry.npmjs.org/:_authToken=${NPM_TOKEN}" > .npmrc && yarn install --frozen-lockfile',
        'echo "UNISWAP_API=${UNISWAP_API}" > .env',
        'yarn install',
        'yarn build',
        'yarn integ-test',
      ],
    })

    applicationStage.addPost(testAction)
  }
}

const app = new cdk.App()

// Local dev stack
new APIStack(app, `${SERVICE_NAME}Stack`, {
  infuraProjectId: process.env.PROJECT_ID!,
  provisionedConcurrency: process.env.PROVISION_CONCURRENCY ? parseInt(process.env.PROVISION_CONCURRENCY) : 0,
  throttlingOverride: process.env.THROTTLE_PER_FIVE_MINS,
  chatbotSNSArn: process.env.CHATBOT_SNS_ARN,
  stage: STAGE.LOCAL,
})

new APIPipeline(app, `${SERVICE_NAME}PipelineStack`, {
  env: { account: '644039819003', region: 'us-east-2' },
})
