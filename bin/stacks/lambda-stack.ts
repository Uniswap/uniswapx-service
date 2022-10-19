import * as cdk from 'aws-cdk-lib'
import { Duration } from 'aws-cdk-lib'
import * as asg from 'aws-cdk-lib/aws-applicationautoscaling'
import * as aws_cloudwatch from 'aws-cdk-lib/aws-cloudwatch'
import * as aws_cloudwatch_actions from 'aws-cdk-lib/aws-cloudwatch-actions'
import * as aws_iam from 'aws-cdk-lib/aws-iam'
import * as aws_lambda from 'aws-cdk-lib/aws-lambda'
import * as aws_lambda_nodejs from 'aws-cdk-lib/aws-lambda-nodejs'
import * as aws_sns from 'aws-cdk-lib/aws-sns'
import { Construct } from 'constructs'
import * as path from 'path'
import { SERVICE_NAME } from '../constants'

export interface LambdaStackProps extends cdk.NestedStackProps {
  provisionedConcurrency: number
  chatbotSNSArn?: string
}
export class LambdaStack extends cdk.NestedStack {
  public readonly lambda: aws_lambda_nodejs.NodejsFunction
  public readonly getOrdersLambda: aws_lambda_nodejs.NodejsFunction
  public readonly getOrdersLambdaAlias: aws_lambda.Alias

  constructor(scope: Construct, name: string, props: LambdaStackProps) {
    super(scope, name, props)
    const { provisionedConcurrency, chatbotSNSArn } = props

    const lambdaName = `${SERVICE_NAME}Lambda`

    const lambdaRole = new aws_iam.Role(this, `${lambdaName}-LambdaRole`, {
      assumedBy: new aws_iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        aws_iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
        aws_iam.ManagedPolicy.fromAwsManagedPolicyName('SecretsManagerReadWrite'),
        aws_iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonRDSDataFullAccess'),
      ],
    })

    // new DynamoStack(this, `${SERVICE_NAME}DynamoStack`, {})

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

    // ordersTable.grantReadData(this.getOrdersLambda)

    const getOrdersLambdaAlarmErrorRate = new aws_cloudwatch.Alarm(this, `GetOrdersLambdaErrorRate`, {
      metric: new aws_cloudwatch.MathExpression({
        expression: 'errors / invocations',
        usingMetrics: {
          errors: this.getOrdersLambda.metricErrors({
            period: Duration.minutes(5),
            statistic: 'avg',
          }),
          invocations: this.getOrdersLambda.metricInvocations({
            period: Duration.minutes(5),
            statistic: 'avg',
          }),
        },
      }),
      threshold: 0.05,
      evaluationPeriods: 3,
    })

    const getOrdersLambdaThrottlesErrorRate = new aws_cloudwatch.Alarm(this, `GetOrdersLambdaThrottles`, {
      metric: this.getOrdersLambda.metricThrottles({
        period: Duration.minutes(5),
        statistic: 'sum',
      }),
      threshold: 10,
      evaluationPeriods: 3,
    })

    if (chatbotSNSArn) {
      const chatBotTopic = aws_sns.Topic.fromTopicArn(this, `${lambdaName}-ChatbotTopic`, chatbotSNSArn)
      getOrdersLambdaAlarmErrorRate.addAlarmAction(new aws_cloudwatch_actions.SnsAction(chatBotTopic))
      getOrdersLambdaThrottlesErrorRate.addAlarmAction(new aws_cloudwatch_actions.SnsAction(chatBotTopic))
    }

    const enableProvisionedConcurrency = provisionedConcurrency > 0

    this.getOrdersLambdaAlias = new aws_lambda.Alias(this, `GetOrdersLiveAlias`, {
      aliasName: 'live',
      version: this.getOrdersLambda.currentVersion,
      provisionedConcurrentExecutions: enableProvisionedConcurrency ? provisionedConcurrency : undefined,
    })

    if (enableProvisionedConcurrency) {
      const getOrdersTarget = new asg.ScalableTarget(this, `GetOrders-ProvConcASG-${lambdaName}`, {
        serviceNamespace: asg.ServiceNamespace.LAMBDA,
        maxCapacity: provisionedConcurrency * 5,
        minCapacity: provisionedConcurrency,
        resourceId: `function:${this.getOrdersLambdaAlias.lambda.functionName}:${this.getOrdersLambdaAlias.aliasName}`,
        scalableDimension: 'lambda:function:ProvisionedConcurrency',
      })

      getOrdersTarget.node.addDependency(this.getOrdersLambdaAlias)

      getOrdersTarget.scaleToTrackMetric(`GetOrders-ProvConcTracking-${lambdaName}`, {
        targetValue: 0.8,
        predefinedMetric: asg.PredefinedMetric.LAMBDA_PROVISIONED_CONCURRENCY_UTILIZATION,
      })
    }
  }
}
