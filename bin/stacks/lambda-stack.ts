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
  public readonly lambdaAlias: aws_lambda.Alias

  constructor(scope: Construct, name: string, props: LambdaStackProps) {
    super(scope, name, props)
    const { provisionedConcurrency, chatbotSNSArn } = props

    const lambdaName = `${SERVICE_NAME}TokenLambda`

    const lambdaRole = new aws_iam.Role(this, `${lambdaName}-LambdaRole`, {
      assumedBy: new aws_iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [aws_iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')],
    })

    this.lambda = new aws_lambda_nodejs.NodejsFunction(this, lambdaName, {
      role: lambdaRole,
      runtime: aws_lambda.Runtime.NODEJS_16_X,
      entry: path.join(__dirname, '../../lib/handlers/index.ts'),
      handler: 'tokenListHandler',
      timeout: cdk.Duration.seconds(29),
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

    const lambdaAlarmErrorRate = new aws_cloudwatch.Alarm(this, `${lambdaName}-LambdaErrorRate`, {
      metric: new aws_cloudwatch.MathExpression({
        expression: 'errors / invocations',
        usingMetrics: {
          errors: this.lambda.metricErrors({
            period: Duration.minutes(5),
            statistic: 'avg',
          }),
          invocations: this.lambda.metricInvocations({
            period: Duration.minutes(5),
            statistic: 'avg',
          }),
        },
      }),
      threshold: 0.05,
      evaluationPeriods: 3,
    })

    const lambdaThrottlesErrorRate = new aws_cloudwatch.Alarm(this, `${lambdaName}-LambdaThrottles`, {
      metric: this.lambda.metricThrottles({
        period: Duration.minutes(5),
        statistic: 'sum',
      }),
      threshold: 10,
      evaluationPeriods: 3,
    })

    if (chatbotSNSArn) {
      const chatBotTopic = aws_sns.Topic.fromTopicArn(this, `${lambdaName}-ChatbotTopic`, chatbotSNSArn)
      lambdaAlarmErrorRate.addAlarmAction(new aws_cloudwatch_actions.SnsAction(chatBotTopic))
      lambdaThrottlesErrorRate.addAlarmAction(new aws_cloudwatch_actions.SnsAction(chatBotTopic))
    }

    const enableProvisionedConcurrency = provisionedConcurrency > 0

    this.lambdaAlias = new aws_lambda.Alias(this, `${lambdaName}-LiveAlias`, {
      aliasName: 'live',
      version: this.lambda.currentVersion,
      provisionedConcurrentExecutions: enableProvisionedConcurrency ? provisionedConcurrency : undefined,
    })

    if (enableProvisionedConcurrency) {
      const target = new asg.ScalableTarget(this, `${lambdaName}-ProvConcASG`, {
        serviceNamespace: asg.ServiceNamespace.LAMBDA,
        maxCapacity: provisionedConcurrency * 5,
        minCapacity: provisionedConcurrency,
        resourceId: `function:${this.lambdaAlias.lambda.functionName}:${this.lambdaAlias.aliasName}`,
        scalableDimension: 'lambda:function:ProvisionedConcurrency',
      })

      target.node.addDependency(this.lambdaAlias)

      target.scaleToTrackMetric(`${lambdaName}-ProvConcTracking`, {
        targetValue: 0.8,
        predefinedMetric: asg.PredefinedMetric.LAMBDA_PROVISIONED_CONCURRENCY_UTILIZATION,
      })
    }
  }
}
