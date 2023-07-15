import * as cdk from 'aws-cdk-lib'
import { Duration } from 'aws-cdk-lib'
import * as asg from 'aws-cdk-lib/aws-applicationautoscaling'
import * as aws_iam from 'aws-cdk-lib/aws-iam'
import * as aws_lambda from 'aws-cdk-lib/aws-lambda'
import { DynamoEventSource, SqsDlq } from 'aws-cdk-lib/aws-lambda-event-sources'
import * as aws_lambda_nodejs from 'aws-cdk-lib/aws-lambda-nodejs'
import { Queue } from 'aws-cdk-lib/aws-sqs'
import { Construct } from 'constructs'
import * as path from 'path'
import { SUPPORTED_CHAINS } from '../../lib/util/chain'
import { STAGE } from '../../lib/util/stage'
import { SERVICE_NAME } from '../constants'
import { DynamoStack, TableCapacityOptions } from './dynamo-stack'
import { StepFunctionStack } from './step-function-stack'

export interface LambdaStackProps extends cdk.NestedStackProps {
  provisionedConcurrency: number
  stage: STAGE
  envVars: { [key: string]: string }
  tableCapacityOptions: TableCapacityOptions
}
export class LambdaStack extends cdk.NestedStack {
  public readonly postOrderLambda: aws_lambda_nodejs.NodejsFunction
  public readonly getOrdersLambda: aws_lambda_nodejs.NodejsFunction
  public readonly getNonceLambda: aws_lambda_nodejs.NodejsFunction
  private readonly orderNotificationLambda: aws_lambda_nodejs.NodejsFunction
  private readonly getDocsLambda: aws_lambda_nodejs.NodejsFunction
  private readonly getDocsUILambda: aws_lambda_nodejs.NodejsFunction
  public readonly postOrderLambdaAlias: aws_lambda.Alias
  public readonly getOrdersLambdaAlias: aws_lambda.Alias
  public readonly getNonceLambdaAlias: aws_lambda.Alias
  public readonly getDocsLambdaAlias: aws_lambda.Alias
  public readonly getDocsUILambdaAlias: aws_lambda.Alias
  private readonly orderNotificationLambdaAlias: aws_lambda.Alias

  public readonly chainIdToStatusTrackingStateMachineArn: { [key: string]: string }
  public readonly checkStatusFunction: aws_lambda_nodejs.NodejsFunction

  constructor(scope: Construct, name: string, props: LambdaStackProps) {
    super(scope, name, props)
    const { provisionedConcurrency, tableCapacityOptions } = props

    const lambdaName = `${SERVICE_NAME}Lambda`

    const lambdaRole = new aws_iam.Role(this, `${lambdaName}-LambdaRole`, {
      assumedBy: new aws_iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        aws_iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
        aws_iam.ManagedPolicy.fromAwsManagedPolicyName('AWSStepFunctionsFullAccess'),
        aws_iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonDynamoDBFullAccess'),
      ],
    })

    const databaseStack = new DynamoStack(this, `${SERVICE_NAME}DynamoStack`, { tableCapacityOptions })

    const sfnStack = new StepFunctionStack(this, `${SERVICE_NAME}SfnStack`, {
      stage: props.stage as STAGE,
      envVars: {
        ...props.envVars,
      },
      lambdaRole: lambdaRole,
    })
    this.chainIdToStatusTrackingStateMachineArn = sfnStack.chainIdToStatusTrackingStateMachineArn
    this.checkStatusFunction = sfnStack.checkStatusFunction

    this.getOrdersLambda = new aws_lambda_nodejs.NodejsFunction(this, `GetOrders${lambdaName}`, {
      role: lambdaRole,
      runtime: aws_lambda.Runtime.NODEJS_16_X,
      entry: path.join(__dirname, '../../lib/handlers/index.ts'),
      handler: 'getOrdersHandler',
      memorySize: 512,
      bundling: {
        minify: true,
        sourceMap: true,
      },
      environment: {
        VERSION: '2',
        NODE_OPTIONS: '--enable-source-maps',
      },
    })

    this.orderNotificationLambda = new aws_lambda_nodejs.NodejsFunction(this, `OrderNotification${lambdaName}`, {
      role: lambdaRole,
      runtime: aws_lambda.Runtime.NODEJS_16_X,
      entry: path.join(__dirname, '../../lib/handlers/index.ts'),
      handler: 'orderNotificationHandler',
      memorySize: 256,
      timeout: Duration.seconds(30),
      bundling: {
        minify: true,
        sourceMap: true,
      },
      environment: {
        VERSION: '2',
        NODE_OPTIONS: '--enable-source-maps',
      },
    })

    // TODO: add alarms on the size of this dead letter queue
    const orderNotificationDlq = new Queue(this, 'orderNotificationDlq')

    this.orderNotificationLambda.addEventSource(
      new DynamoEventSource(databaseStack.ordersTable, {
        startingPosition: aws_lambda.StartingPosition.TRIM_HORIZON,
        batchSize: 1,
        retryAttempts: 1,
        bisectBatchOnError: true,
        reportBatchItemFailures: true,
        onFailure: new SqsDlq(orderNotificationDlq),
      })
    )

    const postOrderEnv: any = {
      ...props.envVars,
      stage: props.stage as STAGE,
      VERSION: '2',
      NODE_OPTIONS: '--enable-source-maps',
      REGION: this.region,
    }

    for (const chainId of SUPPORTED_CHAINS) {
      postOrderEnv[`STATE_MACHINE_ARN_${chainId}`] = sfnStack.chainIdToStatusTrackingStateMachineArn[chainId]
    }

    this.postOrderLambda = new aws_lambda_nodejs.NodejsFunction(this, `PostOrder${lambdaName}`, {
      role: lambdaRole,
      runtime: aws_lambda.Runtime.NODEJS_16_X,
      entry: path.join(__dirname, '../../lib/handlers/index.ts'),
      handler: 'postOrderHandler',
      memorySize: 512,
      bundling: {
        minify: true,
        sourceMap: true,
      },
      environment: postOrderEnv,
    })

    this.getNonceLambda = new aws_lambda_nodejs.NodejsFunction(this, `GetNonce${lambdaName}`, {
      role: lambdaRole,
      runtime: aws_lambda.Runtime.NODEJS_16_X,
      entry: path.join(__dirname, '../../lib/handlers/index.ts'),
      handler: 'getNonceHandler',
      memorySize: 256,
      bundling: {
        minify: true,
        sourceMap: true,
      },
      environment: {
        VERSION: '2',
        NODE_OPTIONS: '--enable-source-maps',
      },
    })

    this.getDocsLambda = new aws_lambda_nodejs.NodejsFunction(this, `GetDocs${lambdaName}`, {
      role: lambdaRole,
      runtime: aws_lambda.Runtime.NODEJS_16_X,
      entry: path.join(__dirname, '../../lib/handlers/index.ts'),
      handler: 'getDocsHandler',
      memorySize: 512,
      bundling: {
        minify: true,
        sourceMap: true,
      },
      environment: {
        ...props.envVars,
        VERSION: '2',
        NODE_OPTIONS: '--enable-source-maps',
      },
    })

    this.getDocsUILambda = new aws_lambda_nodejs.NodejsFunction(this, `GetDocsUI${lambdaName}`, {
      role: lambdaRole,
      runtime: aws_lambda.Runtime.NODEJS_16_X,
      entry: path.join(__dirname, '../../lib/handlers/index.ts'),
      handler: 'getDocsUIHandler',
      memorySize: 512,
      bundling: {
        minify: true,
        sourceMap: true,
      },
      environment: {
        ...props.envVars,
        VERSION: '2',
        NODE_OPTIONS: '--enable-source-maps',
      },
    })

    if (props.envVars['POSTED_ORDER_DESTINATION_ARN']) {
      new cdk.aws_logs.CfnSubscriptionFilter(this, 'PostedOrderSub', {
        destinationArn: props.envVars['POSTED_ORDER_DESTINATION_ARN'],
        filterPattern: '{ $.eventType = "OrderPosted" }',
        logGroupName: this.postOrderLambda.logGroup.logGroupName,
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
  }
}
