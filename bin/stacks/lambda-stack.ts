import * as cdk from 'aws-cdk-lib'
import { Duration } from 'aws-cdk-lib'
import * as asg from 'aws-cdk-lib/aws-applicationautoscaling'
import { Alarm, ComparisonOperator, MathExpression, Metric, TreatMissingData } from 'aws-cdk-lib/aws-cloudwatch'
import { CfnEIP, NatProvider, Vpc } from 'aws-cdk-lib/aws-ec2'
import * as aws_iam from 'aws-cdk-lib/aws-iam'
import * as aws_kms from 'aws-cdk-lib/aws-kms'
import * as aws_lambda from 'aws-cdk-lib/aws-lambda'
import { DynamoEventSource, SqsDlq } from 'aws-cdk-lib/aws-lambda-event-sources'
import * as aws_lambda_nodejs from 'aws-cdk-lib/aws-lambda-nodejs'
import { Queue } from 'aws-cdk-lib/aws-sqs'
import { Construct } from 'constructs'
import * as path from 'path'
import { SUPPORTED_CHAINS } from '../../lib/util/chain'
import { STAGE } from '../../lib/util/stage'
import { SERVICE_NAME } from '../constants'
import { CronStack } from './cron-stack'
import { DynamoStack, IndexCapacityConfig, TableCapacityConfig } from './dynamo-stack'
import { StepFunctionStack } from './step-function-stack'

export interface LambdaStackProps extends cdk.NestedStackProps {
  provisionedConcurrency: number
  stage: STAGE
  envVars: { [key: string]: string }
  kmsKey: aws_kms.Key
  tableCapacityConfig: TableCapacityConfig
  indexCapacityConfig?: IndexCapacityConfig
  chatbotSNSArn?: string
}
export class LambdaStack extends cdk.NestedStack {
  public readonly postOrderLambda: aws_lambda_nodejs.NodejsFunction
  public readonly postLimitOrderLambda: aws_lambda_nodejs.NodejsFunction
  public readonly getOrdersLambda: aws_lambda_nodejs.NodejsFunction
  public readonly getLimitOrdersLambda: aws_lambda_nodejs.NodejsFunction
  public readonly getNonceLambda: aws_lambda_nodejs.NodejsFunction
  private readonly orderNotificationLambda: aws_lambda_nodejs.NodejsFunction
  private readonly getDocsLambda: aws_lambda_nodejs.NodejsFunction
  private readonly getDocsUILambda: aws_lambda_nodejs.NodejsFunction
  public readonly postOrderLambdaAlias: aws_lambda.Alias
  public readonly postLimitOrderLambdaAlias: aws_lambda.Alias
  public readonly getOrdersLambdaAlias: aws_lambda.Alias
  public readonly getLimitOrdersLambdaAlias: aws_lambda.Alias
  public readonly getNonceLambdaAlias: aws_lambda.Alias
  public readonly getDocsLambdaAlias: aws_lambda.Alias
  public readonly getDocsUILambdaAlias: aws_lambda.Alias
  private readonly orderNotificationLambdaAlias: aws_lambda.Alias

  public readonly chainIdToStatusTrackingStateMachineArn: { [key: string]: string }
  public readonly checkStatusFunction: aws_lambda_nodejs.NodejsFunction

  constructor(scope: Construct, name: string, props: LambdaStackProps) {
    super(scope, name, props)
    const { provisionedConcurrency, kmsKey, tableCapacityConfig, indexCapacityConfig, chatbotSNSArn } = props

    const lambdaName = `${SERVICE_NAME}Lambda`

    const lambdaRole = new aws_iam.Role(this, `${lambdaName}-LambdaRole`, {
      assumedBy: new aws_iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        aws_iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
        aws_iam.ManagedPolicy.fromAwsManagedPolicyName('AWSStepFunctionsFullAccess'),
        aws_iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonDynamoDBFullAccess'),
        aws_iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonS3ReadOnlyAccess'),
      ],
    })

    lambdaRole.addToPolicy(
      new aws_iam.PolicyStatement({
        actions: ['ec2:CreateNetworkInterface', 'ec2:DescribeNetworkInterfaces', 'ec2:DeleteNetworkInterface'],
        resources: ['*'],
      })
    )

    // allow lambdas to access the cosigner key
    lambdaRole.addToPolicy(
      new cdk.aws_iam.PolicyStatement({
        resources: [kmsKey.keyArn],
        actions: ['kms:GetPublicKey', 'kms:Sign'],
        effect: cdk.aws_iam.Effect.ALLOW,
      })
    )

    const notificationElasticIp = new CfnEIP(this, `NotificationLambdaElasticIp`, {
      domain: 'vpc',
      tags: [
        {
          key: 'Name',
          value: 'NotificationLambdaElasticIp',
        },
      ],
    })

    const vpc = new Vpc(this, 'NotificationLambdaVpc', {
      vpcName: 'NotificationLambdaVpc',
      natGateways: 1,
      natGatewayProvider: NatProvider.gateway({
        eipAllocationIds: [notificationElasticIp.attrAllocationId],
      }),
      maxAzs: 3,
    })

    const databaseStack = new DynamoStack(this, `${SERVICE_NAME}DynamoStack`, {
      tableCapacityConfig,
      indexCapacityConfig,
    })

    const sfnStack = new StepFunctionStack(this, `${SERVICE_NAME}SfnStack`, {
      stage: props.stage as STAGE,
      envVars: {
        ...props.envVars,
      },
      lambdaRole: lambdaRole,
    })
    this.chainIdToStatusTrackingStateMachineArn = sfnStack.chainIdToStatusTrackingStateMachineArn
    this.checkStatusFunction = sfnStack.checkStatusFunction

    const getOrdersEnv = {
      ...props.envVars,
      stage: props.stage as STAGE,
      KMS_KEY_ID: kmsKey.keyId,
      VERSION: '4',
      NODE_OPTIONS: '--enable-source-maps',
    }

    this.getOrdersLambda = new aws_lambda_nodejs.NodejsFunction(this, `GetOrders${lambdaName}`, {
      role: lambdaRole,
      runtime: aws_lambda.Runtime.NODEJS_18_X,
      entry: path.join(__dirname, '../../lib/handlers/get-orders/index.ts'),
      handler: 'getOrdersHandler',
      timeout: Duration.seconds(29),
      memorySize: 512,
      bundling: {
        minify: true,
        sourceMap: true,
      },
      environment: getOrdersEnv,
      tracing: aws_lambda.Tracing.ACTIVE,
    })

    this.orderNotificationLambda = new aws_lambda_nodejs.NodejsFunction(this, `OrderNotification${lambdaName}`, {
      role: lambdaRole,
      runtime: aws_lambda.Runtime.NODEJS_18_X,
      entry: path.join(__dirname, '../../lib/handlers/order-notification/index.ts'),
      handler: 'orderNotificationHandler',
      memorySize: 512,
      timeout: Duration.seconds(29),
      bundling: {
        minify: true,
        sourceMap: true,
      },
      environment: {
        ...props.envVars,
        stage: props.stage as STAGE,
        KMS_KEY_ID: kmsKey.keyId,
        VERSION: '3',
        NODE_OPTIONS: '--enable-source-maps',
      },
      vpc,
      vpcSubnets: {
        subnets: [...vpc.privateSubnets],
      },
    })

    const notificationConfig = {
      startingPosition: aws_lambda.StartingPosition.TRIM_HORIZON,
      batchSize: 1,
      retryAttempts: 1,
      bisectBatchOnError: true,
      reportBatchItemFailures: true,
    }

    // TODO: add alarms on the size of this dead letter queue
    const orderNotificationDlq = new Queue(this, 'orderNotificationDlq')
    const limitOrderNotificationDlq = new Queue(this, 'limitOrderNotificationDlq')

    this.orderNotificationLambda.addEventSource(
      new DynamoEventSource(databaseStack.ordersTable, {
        ...notificationConfig,
        onFailure: new SqsDlq(orderNotificationDlq),
      })
    )

    this.orderNotificationLambda.addEventSource(
      new DynamoEventSource(databaseStack.limitOrdersTable, {
        ...notificationConfig,
        onFailure: new SqsDlq(limitOrderNotificationDlq),
      })
    )

    const postOrderEnv: any = {
      ...props.envVars,
      stage: props.stage as STAGE,
      KMS_KEY_ID: kmsKey.keyId,
      VERSION: '4',
      NODE_OPTIONS: '--enable-source-maps',
      REGION: this.region,
    }

    SUPPORTED_CHAINS.forEach((chainId) => {
      postOrderEnv[`STATE_MACHINE_ARN_${chainId}`] = sfnStack.chainIdToStatusTrackingStateMachineArn[chainId]
    })

    this.postOrderLambda = new aws_lambda_nodejs.NodejsFunction(this, `PostOrder${lambdaName}`, {
      role: lambdaRole,
      runtime: aws_lambda.Runtime.NODEJS_18_X,
      entry: path.join(__dirname, '../../lib/handlers/post-order/index.ts'),
      handler: 'postOrderHandler',
      timeout: Duration.seconds(29),
      memorySize: 512,
      bundling: {
        minify: true,
        sourceMap: true,
      },
      environment: postOrderEnv,
      tracing: aws_lambda.Tracing.ACTIVE,
    })

    this.postLimitOrderLambda = new aws_lambda_nodejs.NodejsFunction(this, `PostLimitOrder${lambdaName}`, {
      role: lambdaRole,
      runtime: aws_lambda.Runtime.NODEJS_18_X,
      entry: path.join(__dirname, '../../lib/handlers/post-limit-order/index.ts'),
      handler: 'postLimitOrderHandler',
      timeout: Duration.seconds(29),
      memorySize: 512,
      bundling: {
        minify: true,
        sourceMap: true,
      },
      environment: postOrderEnv,
      tracing: aws_lambda.Tracing.ACTIVE,
    })

    this.getLimitOrdersLambda = new aws_lambda_nodejs.NodejsFunction(this, `GetLimitOrders${lambdaName}`, {
      role: lambdaRole,
      runtime: aws_lambda.Runtime.NODEJS_18_X,
      entry: path.join(__dirname, '../../lib/handlers/get-limit-orders/index.ts'),
      handler: 'getLimitOrdersHandler',
      timeout: Duration.seconds(5),
      memorySize: 512,
      bundling: {
        minify: true,
        sourceMap: true,
      },
      environment: getOrdersEnv,
    })

    this.getNonceLambda = new aws_lambda_nodejs.NodejsFunction(this, `GetNonce${lambdaName}`, {
      role: lambdaRole,
      runtime: aws_lambda.Runtime.NODEJS_18_X,
      entry: path.join(__dirname, '../../lib/handlers/get-nonce/index.ts'),
      handler: 'getNonceHandler',
      memorySize: 512,
      timeout: Duration.seconds(29),
      bundling: {
        minify: true,
        sourceMap: true,
      },
      environment: {
        ...props.envVars,
        stage: props.stage as STAGE,
        KMS_KEY_ID: kmsKey.keyId,
        VERSION: '3',
        NODE_OPTIONS: '--enable-source-maps',
      },
      tracing: aws_lambda.Tracing.ACTIVE,
    })

    this.getDocsLambda = new aws_lambda_nodejs.NodejsFunction(this, `GetDocs${lambdaName}`, {
      role: lambdaRole,
      runtime: aws_lambda.Runtime.NODEJS_18_X,
      entry: path.join(__dirname, '../../lib/handlers/get-docs/index.ts'),
      handler: 'getDocsHandler',
      memorySize: 512,
      bundling: {
        minify: true,
        sourceMap: true,
      },
      environment: {
        stage: props.stage as STAGE,
        ...props.envVars,
        KMS_KEY_ID: kmsKey.keyId,
        VERSION: '3',
        NODE_OPTIONS: '--enable-source-maps',
      },
    })

    this.getDocsUILambda = new aws_lambda_nodejs.NodejsFunction(this, `GetDocsUI${lambdaName}`, {
      role: lambdaRole,
      runtime: aws_lambda.Runtime.NODEJS_18_X,
      entry: path.join(__dirname, '../../lib/handlers/get-docs/index.ts'),
      handler: 'getDocsUIHandler',
      memorySize: 512,
      bundling: {
        minify: true,
        sourceMap: true,
      },
      environment: {
        stage: props.stage as STAGE,
        KMS_KEY_ID: kmsKey.keyId,
        ...props.envVars,
        VERSION: '3',
        NODE_OPTIONS: '--enable-source-maps',
      },
    })

    if (props.envVars['POSTED_ORDER_DESTINATION_ARN']) {
      new cdk.aws_logs.CfnSubscriptionFilter(this, 'PostedOrderSub', {
        destinationArn: props.envVars['POSTED_ORDER_DESTINATION_ARN'],
        filterPattern: '{ $.eventType = "OrderPosted" }',
        logGroupName: this.postOrderLambda.logGroup.logGroupName,
      })

      new cdk.aws_logs.CfnSubscriptionFilter(this, 'PostedLimitOrderSub', {
        destinationArn: props.envVars['POSTED_ORDER_DESTINATION_ARN'],
        filterPattern: '{ $.eventType = "OrderPosted" }',
        logGroupName: this.postLimitOrderLambda.logGroup.logGroupName,
      })
    }

    const enableProvisionedConcurrency = provisionedConcurrency > 0

    this.getOrdersLambdaAlias = new aws_lambda.Alias(this, `GetOrdersLiveAlias`, {
      aliasName: 'live',
      version: this.getOrdersLambda.currentVersion,
      provisionedConcurrentExecutions: enableProvisionedConcurrency ? provisionedConcurrency : undefined,
    })

    this.postOrderLambdaAlias = new aws_lambda.Alias(this, `PostOrderLiveAlias`, {
      aliasName: 'live',
      version: this.postOrderLambda.currentVersion,
      provisionedConcurrentExecutions: enableProvisionedConcurrency ? provisionedConcurrency : undefined,
    })

    this.postLimitOrderLambdaAlias = new aws_lambda.Alias(this, `PostLimitOrderLiveAlias`, {
      aliasName: 'live',
      version: this.postLimitOrderLambda.currentVersion,
      provisionedConcurrentExecutions: enableProvisionedConcurrency ? provisionedConcurrency : undefined,
    })

    this.getLimitOrdersLambdaAlias = new aws_lambda.Alias(this, `GetLimitOrdersLiveAlias`, {
      aliasName: 'live',
      version: this.getLimitOrdersLambda.currentVersion,
      provisionedConcurrentExecutions: enableProvisionedConcurrency ? provisionedConcurrency : undefined,
    })

    this.getNonceLambdaAlias = new aws_lambda.Alias(this, `GetNonceLiveAlias`, {
      aliasName: 'live',
      version: this.getNonceLambda.currentVersion,
      provisionedConcurrentExecutions: enableProvisionedConcurrency ? provisionedConcurrency : undefined,
    })

    this.getDocsLambdaAlias = new aws_lambda.Alias(this, `GetDocsLiveAlias`, {
      aliasName: 'live',
      version: this.getDocsLambda.currentVersion,
      provisionedConcurrentExecutions: enableProvisionedConcurrency ? provisionedConcurrency : undefined,
    })

    this.getDocsUILambdaAlias = new aws_lambda.Alias(this, `GetDocsUILiveAlias`, {
      aliasName: 'live',
      version: this.getDocsUILambda.currentVersion,
      provisionedConcurrentExecutions: enableProvisionedConcurrency ? provisionedConcurrency : undefined,
    })

    this.orderNotificationLambdaAlias = new aws_lambda.Alias(this, `OrderNotificationAlias`, {
      aliasName: 'live',
      version: this.orderNotificationLambda.currentVersion,
      provisionedConcurrentExecutions: enableProvisionedConcurrency ? provisionedConcurrency : undefined,
    })

    if (enableProvisionedConcurrency) {
      const postOrderTarget = new asg.ScalableTarget(this, `${lambdaName}-PostOrder-ProvConcASG`, {
        serviceNamespace: asg.ServiceNamespace.LAMBDA,
        maxCapacity: provisionedConcurrency * 2,
        minCapacity: provisionedConcurrency,
        resourceId: `function:${this.postOrderLambdaAlias.lambda.functionName}:${this.postOrderLambdaAlias.aliasName}`,
        scalableDimension: 'lambda:function:ProvisionedConcurrency',
      })

      postOrderTarget.node.addDependency(this.postOrderLambdaAlias)
      postOrderTarget.scaleToTrackMetric(`${lambdaName}-PostOrder-ProvConcTracking`, {
        targetValue: 0.8,
        predefinedMetric: asg.PredefinedMetric.LAMBDA_PROVISIONED_CONCURRENCY_UTILIZATION,
      })

      const PostLimitOrderTarget = new asg.ScalableTarget(this, `${lambdaName}-PostLimitOrder-ProvConcASG`, {
        serviceNamespace: asg.ServiceNamespace.LAMBDA,
        maxCapacity: provisionedConcurrency * 2,
        minCapacity: provisionedConcurrency,
        resourceId: `function:${this.postLimitOrderLambdaAlias.lambda.functionName}:${this.postLimitOrderLambdaAlias.aliasName}`,
        scalableDimension: 'lambda:function:ProvisionedConcurrency',
      })

      PostLimitOrderTarget.node.addDependency(this.postLimitOrderLambdaAlias)
      PostLimitOrderTarget.scaleToTrackMetric(`${lambdaName}-PostLimitOrder-ProvConcTracking`, {
        targetValue: 0.8,
        predefinedMetric: asg.PredefinedMetric.LAMBDA_PROVISIONED_CONCURRENCY_UTILIZATION,
      })

      const getOrdersTarget = new asg.ScalableTarget(this, `GetOrders-ProvConcASG`, {
        serviceNamespace: asg.ServiceNamespace.LAMBDA,
        maxCapacity: provisionedConcurrency * 2,
        minCapacity: provisionedConcurrency,
        resourceId: `function:${this.getOrdersLambdaAlias.lambda.functionName}:${this.getOrdersLambdaAlias.aliasName}`,
        scalableDimension: 'lambda:function:ProvisionedConcurrency',
      })

      getOrdersTarget.node.addDependency(this.getOrdersLambdaAlias)

      getOrdersTarget.scaleToTrackMetric(`GetOrders-ProvConcTracking`, {
        targetValue: 0.8,
        predefinedMetric: asg.PredefinedMetric.LAMBDA_PROVISIONED_CONCURRENCY_UTILIZATION,
      })

      const getLimitOrdersTarget = new asg.ScalableTarget(this, `GetLimitOrders-ProvConcASG`, {
        serviceNamespace: asg.ServiceNamespace.LAMBDA,
        maxCapacity: provisionedConcurrency * 100,
        minCapacity: provisionedConcurrency,
        resourceId: `function:${this.getLimitOrdersLambdaAlias.lambda.functionName}:${this.getLimitOrdersLambdaAlias.aliasName}`,
        scalableDimension: 'lambda:function:ProvisionedConcurrency',
      })

      getLimitOrdersTarget.node.addDependency(this.getLimitOrdersLambda)

      getLimitOrdersTarget.scaleToTrackMetric(`GetLimitOrders-ProvConcTracking`, {
        targetValue: 0.8,
        predefinedMetric: asg.PredefinedMetric.LAMBDA_PROVISIONED_CONCURRENCY_UTILIZATION,
      })

      const getNonceTarget = new asg.ScalableTarget(this, `GetNonce-ProvConcASG`, {
        serviceNamespace: asg.ServiceNamespace.LAMBDA,
        maxCapacity: provisionedConcurrency * 2,
        minCapacity: provisionedConcurrency,
        resourceId: `function:${this.getNonceLambdaAlias.lambda.functionName}:${this.getNonceLambdaAlias.aliasName}`,
        scalableDimension: 'lambda:function:ProvisionedConcurrency',
      })

      getNonceTarget.node.addDependency(this.getNonceLambdaAlias)

      getNonceTarget.scaleToTrackMetric(`GetNonce-ProvConcTracking`, {
        targetValue: 0.8,
        predefinedMetric: asg.PredefinedMetric.LAMBDA_PROVISIONED_CONCURRENCY_UTILIZATION,
      })

      const getDocsTarget = new asg.ScalableTarget(this, `GetDocs-ProvConcASG`, {
        serviceNamespace: asg.ServiceNamespace.LAMBDA,
        maxCapacity: provisionedConcurrency * 2,
        minCapacity: provisionedConcurrency,
        resourceId: `function:${this.getDocsLambdaAlias.lambda.functionName}:${this.getDocsLambdaAlias.aliasName}`,
        scalableDimension: 'lambda:function:ProvisionedConcurrency',
      })

      getDocsTarget.node.addDependency(this.getDocsLambdaAlias)

      getDocsTarget.scaleToTrackMetric(`GetDocs-ProvConcTracking`, {
        targetValue: 0.8,
        predefinedMetric: asg.PredefinedMetric.LAMBDA_PROVISIONED_CONCURRENCY_UTILIZATION,
      })

      const getDocsUITarget = new asg.ScalableTarget(this, `GetDocsUI-ProvConcASG`, {
        serviceNamespace: asg.ServiceNamespace.LAMBDA,
        maxCapacity: provisionedConcurrency * 2,
        minCapacity: provisionedConcurrency,
        resourceId: `function:${this.getDocsUILambdaAlias.lambda.functionName}:${this.getDocsUILambdaAlias.aliasName}`,
        scalableDimension: 'lambda:function:ProvisionedConcurrency',
      })

      getDocsUITarget.node.addDependency(this.getDocsUILambdaAlias)

      getDocsUITarget.scaleToTrackMetric(`GetDocsUI-ProvConcTracking`, {
        targetValue: 0.8,
        predefinedMetric: asg.PredefinedMetric.LAMBDA_PROVISIONED_CONCURRENCY_UTILIZATION,
      })

      const orderNotificationLambdaTarget = new asg.ScalableTarget(this, `OrderNotificationLambda-ProvConcASG`, {
        serviceNamespace: asg.ServiceNamespace.LAMBDA,
        maxCapacity: provisionedConcurrency * 2,
        minCapacity: provisionedConcurrency,
        resourceId: `function:${this.orderNotificationLambdaAlias.lambda.functionName}:${this.orderNotificationLambdaAlias.aliasName}`,
        scalableDimension: 'lambda:function:ProvisionedConcurrency',
      })

      orderNotificationLambdaTarget.node.addDependency(this.orderNotificationLambdaAlias)

      orderNotificationLambdaTarget.scaleToTrackMetric(`OrderNotificationLambda-ProvConcTracking`, {
        targetValue: 0.8,
        predefinedMetric: asg.PredefinedMetric.LAMBDA_PROVISIONED_CONCURRENCY_UTILIZATION,
      })
    }

    let chatBotTopic: cdk.aws_sns.ITopic | undefined
    if (chatbotSNSArn) {
      chatBotTopic = cdk.aws_sns.Topic.fromTopicArn(this, `${SERVICE_NAME}ChatbotTopic`, chatbotSNSArn)
    }

    for (const chainId of SUPPORTED_CHAINS) {
      const orderNotificationErrorRateMetric = new MathExpression({
        expression: '100*(errors/attempts)',
        period: Duration.minutes(5),
        usingMetrics: {
          errors: new Metric({
            namespace: 'Uniswap',
            metricName: `OrderNotificationSendFailure-chain-${chainId}`,
            dimensionsMap: { Service: 'UniswapXService' },
            unit: cdk.aws_cloudwatch.Unit.COUNT,
            statistic: 'sum',
          }),
          attempts: new Metric({
            namespace: 'Uniswap',
            metricName: `OrderNotificationAttempt-chain-${chainId}`,
            dimensionsMap: { Service: 'UniswapXService' },
            unit: cdk.aws_cloudwatch.Unit.COUNT,
            statistic: 'sum',
          }),
        },
      })

      const sev2OrderNotificationErrorRate = new Alarm(this, `OrderNotificationSev2ErrorRate-chain-${chainId}`, {
        alarmName: `${SERVICE_NAME}-SEV2-${props.stage}-OrderNotificationErrorRate-chain-${chainId}`,
        metric: orderNotificationErrorRateMetric,
        threshold: 30,
        evaluationPeriods: 1,
        datapointsToAlarm: 1,
        treatMissingData: TreatMissingData.IGNORE,
        comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      })

      const sev3OrderNotificationErrorRate = new Alarm(this, `OrderNotificationSev3ErrorRate-chain-${chainId}`, {
        alarmName: `${SERVICE_NAME}-SEV3-${props.stage}-OrderNotificationErrorRate-chain-${chainId}`,
        metric: orderNotificationErrorRateMetric,
        threshold: 10,
        evaluationPeriods: 1,
        datapointsToAlarm: 1,
        treatMissingData: TreatMissingData.IGNORE,
        comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      })

      if (chatBotTopic) {
        sev2OrderNotificationErrorRate.addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(chatBotTopic))
        sev3OrderNotificationErrorRate.addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(chatBotTopic))
      }
    }

    /* cron stack */
    new CronStack(this, `${SERVICE_NAME}CronStack`, { lambdaRole })
  }
}
