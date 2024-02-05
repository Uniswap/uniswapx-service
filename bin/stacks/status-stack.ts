// @ts-nocheck
import * as cdk from 'aws-cdk-lib'
import { aws_ecs, aws_ecs_patterns, aws_iam, Duration, StackProps } from 'aws-cdk-lib'
import { Metric } from 'aws-cdk-lib/aws-cloudwatch'
import { DockerImageAsset, Platform } from 'aws-cdk-lib/aws-ecr-assets'
import { Cluster, ContainerImage } from 'aws-cdk-lib/aws-ecs'
import { Construct } from 'constructs'

import { HEALTH_CHECK_PORT, SERVICE_NAME } from '../constants'

// import { AnalyticsStack } from './analytics-stack'
// import { FetcherAlarmStack } from './fetcher-alarm-stack'

export interface StatusStackProps extends StackProps {
  environmentVariables: { [key: string]: string }
  chatbotSNSArn?: string
}

export class StatusStack extends cdk.NestedStack {
  public readonly logDriver: aws_ecs.AwsLogDriver

  constructor(scope: Construct, id: string, props: StatusStackProps) {
    super(scope, id, props)

    const { environmentVariables, chatbotSNSArn } = props

    this.logDriver = new aws_ecs.AwsLogDriver({
      streamPrefix: `${SERVICE_NAME}-LoaderStack`,
    })

    const cluster = new Cluster(this, `Cluster`)

    const loaderStackRole = new aws_iam.Role(this, `LoaderStackRole`, {
      assumedBy: new aws_iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [aws_iam.ManagedPolicy.fromAwsManagedPolicyName('AWSStepFunctionsFullAccess')],
    })

    Metric.grantPutMetricData(loaderStackRole)

    const taskDefinition = new aws_ecs.FargateTaskDefinition(this, `TaskDef`, {
      taskRole: loaderStackRole,
      memoryLimitMiB: 2048,
      cpu: 1024,
      runtimePlatform: {
        operatingSystemFamily: aws_ecs.OperatingSystemFamily.LINUX,
        cpuArchitecture: aws_ecs.CpuArchitecture.X86_64,
      },
    })

    const image = new DockerImageAsset(this, `Image`, {
      directory: '.',
      platform: Platform.LINUX_AMD64,
    })

    taskDefinition
      .addContainer(`TaskContainer`, {
        image: ContainerImage.fromDockerImageAsset(image),
        // We set EMF environment to local, which causes the metrics to be written to STDOUT,
        // and they will be automatically picked up by the cloudwatch log driver defined above.
        environment: { ...environmentVariables, AWS_EMF_ENVIRONMENT: 'Local' },
        logging: this.logDriver,
      })
      .addPortMappings({
        containerPort: HEALTH_CHECK_PORT,
        protocol: aws_ecs.Protocol.TCP,
      })

    const albFargateService = new aws_ecs_patterns.ApplicationLoadBalancedFargateService(this, `FargateService`, {
      cluster,
      taskDefinition,
      desiredCount: 1,
      healthCheckGracePeriod: Duration.seconds(120),
    })

    albFargateService.targetGroup.configureHealthCheck({
      port: '80',
    })
    // if (environmentVariables.BOT_ORDER_LOADER_DESTINATION_ARN && this.logDriver.logGroup?.logGroupName) {
    //   new AnalyticsStack(this, 'LoaderBotAnalyticsStack', {
    //     logGroupName: this.logDriver.logGroup.logGroupName,
    //     destinationArn: environmentVariables.BOT_ORDER_LOADER_DESTINATION_ARN,
    //     filterPattern: '{ $.eventType = "BotLoaderEvent" }',
    //   })
    // }

    // new FetcherAlarmStack(this, 'FetcherAlarmStack', {
    //   chatbotSNSArn,
    //   ecsService: albFargateService.service,
    // })
  }
}
