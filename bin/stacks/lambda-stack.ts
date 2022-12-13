import * as cdk from 'aws-cdk-lib'
import * as asg from 'aws-cdk-lib/aws-applicationautoscaling'
import * as aws_iam from 'aws-cdk-lib/aws-iam'
import * as aws_lambda from 'aws-cdk-lib/aws-lambda'
import { FilterCriteria, FilterRule } from 'aws-cdk-lib/aws-lambda'
import { DynamoEventSource, SqsDlq } from 'aws-cdk-lib/aws-lambda-event-sources'
import * as aws_lambda_nodejs from 'aws-cdk-lib/aws-lambda-nodejs'
import { Construct } from 'constructs'
import * as path from 'path'
import { STAGE } from '../../lib/util/stage'
import { SERVICE_NAME } from '../constants'
import { DynamoStack } from './dynamo-stack'
import { StepFunctionStack } from './step-function-stack'

export interface LambdaStackProps extends cdk.NestedStackProps {
  provisionedConcurrency: number
  stage: STAGE
  envVars?: { [key: string]: string }
}
export class LambdaStack extends cdk.NestedStack {
  private readonly postOrderLambda: aws_lambda_nodejs.NodejsFunction
  private readonly getOrdersLambda: aws_lambda_nodejs.NodejsFunction
  private readonly getNonceLambda: aws_lambda_nodejs.NodejsFunction
  private readonly orderStreamLambda: aws_lambda_nodejs.NodejsFunction
  private readonly getApiDocsJsonLambda: aws_lambda_nodejs.NodejsFunction
  public readonly postOrderLambdaAlias: aws_lambda.Alias
  public readonly getOrdersLambdaAlias: aws_lambda.Alias
  public readonly getNonceLambdaAlias: aws_lambda.Alias
  public readonly getApiDocsJsonLambdaAlias: aws_lambda.Alias
  private readonly orderStreamLambdaAlias: aws_lambda.Alias
  private readonly databaseStack: DynamoStack

  constructor(scope: Construct, name: string, props: LambdaStackProps) {
    super(scope, name, props)
    const { provisionedConcurrency } = props

    const lambdaName = `${SERVICE_NAME}Lambda`

    const lambdaRole = new aws_iam.Role(this, `${lambdaName}-LambdaRole`, {
      assumedBy: new aws_iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        aws_iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
        aws_iam.ManagedPolicy.fromAwsManagedPolicyName('AWSStepFunctionsFullAccess'),
        aws_iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonDynamoDBFullAccess'),
      ],
    })

    this.databaseStack = new DynamoStack(this, `${SERVICE_NAME}DynamoStack`, {})

    const sfnStack = new StepFunctionStack(this, `${SERVICE_NAME}SfnStack`, {
      stage: props.stage as STAGE,
      envVars: {
        ...props.envVars,
      },
      lambdaRole: lambdaRole,
    })

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

    this.orderStreamLambda = new aws_lambda_nodejs.NodejsFunction(this, `OrderStream${lambdaName}`, {
      role: lambdaRole,
      runtime: aws_lambda.Runtime.NODEJS_16_X,
      entry: path.join(__dirname, '../../lib/handlers/index.ts'),
      handler: 'orderStreamHandler',
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
    const deadLetterQueue = new cdk.aws_sqs.Queue(this, 'deadLetterQueue')
    this.orderStreamLambda.addEventSource(
      new DynamoEventSource(this.databaseStack.ordersTable, {
        startingPosition: aws_lambda.StartingPosition.TRIM_HORIZON,
        batchSize: 5,
        bisectBatchOnError: true,
        onFailure: new SqsDlq(deadLetterQueue),
        retryAttempts: 10,
        filters: [
          FilterCriteria.filter({
            eventName: FilterRule.isEqual('INSERT'),
            dynamodb: { NewImage: { filler: { S: FilterRule.exists() } } },
          }),
        ],
      })
    )

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
      environment: {
        VERSION: '2',
        NODE_OPTIONS: '--enable-source-maps',
        STATE_MACHINE_ARN: sfnStack.statusTrackingStateMachine.attrArn,
        REGION: this.region,
      },
    })

    this.getNonceLambda = new aws_lambda_nodejs.NodejsFunction(this, `GetNonce${lambdaName}`, {
      role: lambdaRole,
      runtime: aws_lambda.Runtime.NODEJS_16_X,
      entry: path.join(__dirname, '../../lib/handlers/index.ts'),
      handler: 'getNonceHandler',
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

    this.getApiDocsJsonLambda = new aws_lambda_nodejs.NodejsFunction(this, `GetApiDocsJson${lambdaName}`, {
      role: lambdaRole,
      runtime: aws_lambda.Runtime.NODEJS_16_X,
      entry: path.join(__dirname, '../../lib/handlers/index.ts'),
      handler: 'getApiDocsJsonHandler',
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

    this.getApiDocsJsonLambdaAlias = new aws_lambda.Alias(this, `GetApiDocsJsonAlias`, {
      aliasName: 'live',
      version: this.getApiDocsJsonLambda.currentVersion,
      provisionedConcurrentExecutions: enableProvisionedConcurrency ? provisionedConcurrency : undefined,
    })

    this.orderStreamLambdaAlias = new aws_lambda.Alias(this, `OrderStreamAlias`, {
      aliasName: 'live',
      version: this.orderStreamLambda.currentVersion,
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

      const getApisDocsJsonTarget = new asg.ScalableTarget(this, `GetApiDocsJson-ProvConcASG`, {
        serviceNamespace: asg.ServiceNamespace.LAMBDA,
        maxCapacity: provisionedConcurrency * 2,
        minCapacity: provisionedConcurrency,
        resourceId: `function:${this.getApiDocsJsonLambdaAlias.lambda.functionName}:${this.getApiDocsJsonLambdaAlias.aliasName}`,
        scalableDimension: 'lambda:function:ProvisionedConcurrency',
      })

      getApisDocsJsonTarget.node.addDependency(this.getApiDocsJsonLambdaAlias)

      getApisDocsJsonTarget.scaleToTrackMetric(`GetApiDocsJson-ProvConcTracking`, {
        targetValue: 0.8,
        predefinedMetric: asg.PredefinedMetric.LAMBDA_PROVISIONED_CONCURRENCY_UTILIZATION,
      })

      const orderStreamLambdaTarget = new asg.ScalableTarget(this, `OrderStreamLambda-ProvConcASG`, {
        serviceNamespace: asg.ServiceNamespace.LAMBDA,
        maxCapacity: provisionedConcurrency * 2,
        minCapacity: provisionedConcurrency,
        resourceId: `function:${this.orderStreamLambdaAlias.lambda.functionName}:${this.orderStreamLambdaAlias.aliasName}`,
        scalableDimension: 'lambda:function:ProvisionedConcurrency',
      })

      orderStreamLambdaTarget.node.addDependency(this.orderStreamLambdaAlias)

      orderStreamLambdaTarget.scaleToTrackMetric(`OrderStreamLambda-ProvConcTracking`, {
        targetValue: 0.8,
        predefinedMetric: asg.PredefinedMetric.LAMBDA_PROVISIONED_CONCURRENCY_UTILIZATION,
      })
    }
  }
}
