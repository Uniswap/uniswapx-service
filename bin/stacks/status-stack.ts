import * as cdk from 'aws-cdk-lib'
import { aws_ecs, aws_ecs_patterns, aws_iam, Duration, StackProps } from 'aws-cdk-lib'
import { Alarm, ComparisonOperator, Metric, TreatMissingData } from 'aws-cdk-lib/aws-cloudwatch'
import { DockerImageAsset, Platform } from 'aws-cdk-lib/aws-ecr-assets'
import { Cluster, ContainerImage } from 'aws-cdk-lib/aws-ecs'
import { Construct } from 'constructs'
import { OnChainStatusCheckerMetricNames } from '../../lib/Metrics'
import { STAGE } from '../../lib/util/stage'
import { HEALTH_CHECK_PORT, SERVICE_NAME } from '../constants'

export interface StatusStackProps extends StackProps {
  environmentVariables: { [key: string]: string }
  stage: string
  chatbotSNSArn?: string
}

export class StatusStack extends cdk.NestedStack {
  public readonly logDriver: aws_ecs.AwsLogDriver

  constructor(scope: Construct, id: string, props: StatusStackProps) {
    super(scope, id, props)

    const { environmentVariables } = props

    this.logDriver = new aws_ecs.AwsLogDriver({
      streamPrefix: `${SERVICE_NAME}-StatusStack`,
    })

    const cluster = new Cluster(this, `Cluster`)

    const loaderStackRole = new aws_iam.Role(this, `StatusStackRole`, {
      assumedBy: new aws_iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [aws_iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonDynamoDBFullAccess')],
    })

    Metric.grantPutMetricData(loaderStackRole)

    const taskDefinition = new aws_ecs.FargateTaskDefinition(this, `TaskDef`, {
      taskRole: loaderStackRole,
      memoryLimitMiB: 4096,
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

    new aws_ecs_patterns.ApplicationLoadBalancedFargateService(this, `StatusService`, {
      cluster,
      taskDefinition,
      desiredCount: 1,
      healthCheckGracePeriod: Duration.seconds(60),
    })

    new Alarm(this, `${SERVICE_NAME}-SEV3-${OnChainStatusCheckerMetricNames.TotalLoopProcessingTime}`, {
      alarmName: `${SERVICE_NAME}-SEV3-${OnChainStatusCheckerMetricNames.TotalLoopProcessingTime}`,
      metric: new Metric({
        namespace: 'Uniswap',
        metricName: OnChainStatusCheckerMetricNames.TotalLoopProcessingTime,
        dimensionsMap: { service: SERVICE_NAME },
        unit: cdk.aws_cloudwatch.Unit.SECONDS,
      }),
      threshold: 480, // 8 minutes
      evaluationPeriods: props.stage == STAGE.BETA ? 5 : 3,
    })

    new Alarm(this, `${SERVICE_NAME}-SEV3-${OnChainStatusCheckerMetricNames.TotalOrderProcessingErrors}`, {
      alarmName: `${SERVICE_NAME}-SEV3-${OnChainStatusCheckerMetricNames.TotalOrderProcessingErrors}`,
      metric: new Metric({
        namespace: 'Uniswap',
        metricName: OnChainStatusCheckerMetricNames.TotalOrderProcessingErrors,
        dimensionsMap: { service: SERVICE_NAME },
        unit: cdk.aws_cloudwatch.Unit.COUNT,
      }),
      threshold: 10,
      evaluationPeriods: props.stage == STAGE.BETA ? 5 : 3,
    })

    new Alarm(this, `${SERVICE_NAME}-SEV2-${OnChainStatusCheckerMetricNames.LoopError}`, {
      alarmName: `${SERVICE_NAME}-SEV2-${OnChainStatusCheckerMetricNames.LoopError}`,
      metric: new Metric({
        namespace: 'Uniswap',
        metricName: OnChainStatusCheckerMetricNames.LoopError,
        dimensionsMap: { service: SERVICE_NAME },
        unit: cdk.aws_cloudwatch.Unit.COUNT,
      }),
      threshold: 1,
      evaluationPeriods: props.stage == STAGE.BETA ? 5 : 3,
    })

    new Alarm(this, `${SERVICE_NAME}-SEV2-${OnChainStatusCheckerMetricNames.LoopCompleted}`, {
      alarmName: `${SERVICE_NAME}-SEV2-${OnChainStatusCheckerMetricNames.LoopCompleted}`,
      metric: new Metric({
        namespace: 'Uniswap',
        metricName: OnChainStatusCheckerMetricNames.LoopCompleted,
        dimensionsMap: { service: SERVICE_NAME },
        unit: cdk.aws_cloudwatch.Unit.COUNT,
        period: cdk.Duration.minutes(2),
      }),
      comparisonOperator: ComparisonOperator.LESS_THAN_THRESHOLD,
      threshold: 1,
      treatMissingData: TreatMissingData.BREACHING,
      evaluationPeriods: props.stage == STAGE.BETA ? 5 : 3,
    })

    new Alarm(this, `${SERVICE_NAME}-SEV2-${OnChainStatusCheckerMetricNames.LoopEnded}`, {
      alarmName: `${SERVICE_NAME}-SEV2-${OnChainStatusCheckerMetricNames.LoopEnded}`,
      metric: new Metric({
        namespace: 'Uniswap',
        metricName: OnChainStatusCheckerMetricNames.LoopEnded,
        dimensionsMap: { service: SERVICE_NAME },
        unit: cdk.aws_cloudwatch.Unit.COUNT,
      }),
      threshold: 1,
      evaluationPeriods: props.stage == STAGE.BETA ? 5 : 1,
    })
  }
}
