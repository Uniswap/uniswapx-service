import * as cdk from 'aws-cdk-lib'
import { CfnOutput, Duration } from 'aws-cdk-lib'
import * as aws_apigateway from 'aws-cdk-lib/aws-apigateway'
import { MethodLoggingLevel } from 'aws-cdk-lib/aws-apigateway'
import * as aws_cloudwatch from 'aws-cdk-lib/aws-cloudwatch'
import * as aws_cloudwatch_actions from 'aws-cdk-lib/aws-cloudwatch-actions'
import * as aws_logs from 'aws-cdk-lib/aws-logs'
import * as aws_sns from 'aws-cdk-lib/aws-sns'
import * as aws_waf from 'aws-cdk-lib/aws-wafv2'
import { Construct } from 'constructs'
import { STAGE } from '../../lib/util/stage'
import { SERVICE_NAME } from '../constants'
import { LambdaStack } from './lambda-stack'

export class APIStack extends cdk.Stack {
  public readonly url: CfnOutput

  constructor(
    parent: Construct,
    name: string,
    props: cdk.StackProps & {
      provisionedConcurrency: number
      throttlingOverride?: string
      chatbotSNSArn?: string
      stage: string
      envVars: { [key: string]: string }
    }
  ) {
    super(parent, name, props)

    const { throttlingOverride, chatbotSNSArn, stage, provisionedConcurrency } = props

    const {
      getOrdersLambdaAlias,
      getNonceLambdaAlias,
      postOrderLambdaAlias,
      getDocsLambdaAlias,
      deleteOrderLambdaAlias,
      getDocsUILambdaAlias
    } = new LambdaStack(this, `${SERVICE_NAME}LambdaStack`, {
      provisionedConcurrency,
      stage: stage as STAGE,
      envVars: props.envVars,
    })

    const accessLogGroup = new aws_logs.LogGroup(this, `${SERVICE_NAME}APIGAccessLogs`)

    const api = new aws_apigateway.RestApi(this, `${SERVICE_NAME}`, {
      restApiName: `${SERVICE_NAME}`,
      deployOptions: {
        tracingEnabled: true,
        loggingLevel: MethodLoggingLevel.ERROR,
        accessLogDestination: new aws_apigateway.LogGroupLogDestination(accessLogGroup),
        accessLogFormat: aws_apigateway.AccessLogFormat.jsonWithStandardFields({
          ip: false,
          caller: false,
          user: false,
          requestTime: true,
          httpMethod: true,
          resourcePath: true,
          status: true,
          protocol: true,
          responseLength: true,
        }),
      },
      defaultCorsPreflightOptions: {
        allowOrigins: aws_apigateway.Cors.ALL_ORIGINS,
        allowMethods: aws_apigateway.Cors.ALL_METHODS,
      },
    })

    const ipThrottlingACL = new aws_waf.CfnWebACL(this, `${SERVICE_NAME}IPThrottlingACL`, {
      defaultAction: { allow: {} },
      scope: 'REGIONAL',
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: `${SERVICE_NAME}IPBasedThrottling`,
      },
      customResponseBodies: {
        [`${SERVICE_NAME}ThrottledResponseBody`]: {
          contentType: 'APPLICATION_JSON',
          content: '{"errorCode": "TOO_MANY_REQUESTS"}',
        },
      },
      name: `${SERVICE_NAME}IPThrottling`,
      rules: [
        {
          name: 'ip',
          priority: 0,
          statement: {
            rateBasedStatement: {
              // Limit is per 5 mins, i.e. 1200 requests every 5 mins
              limit: throttlingOverride ? parseInt(throttlingOverride) : 1200,
              // API is of type EDGE so is fronted by Cloudfront as a proxy.
              // Use the ip set in X-Forwarded-For by Cloudfront, not the regular IP
              // which would just resolve to Cloudfronts IP.
              aggregateKeyType: 'FORWARDED_IP',
              forwardedIpConfig: {
                headerName: 'X-Forwarded-For',
                fallbackBehavior: 'MATCH',
              },
            },
          },
          action: {
            block: {
              customResponse: {
                responseCode: 429,
                customResponseBodyKey: `${SERVICE_NAME}ThrottledResponseBody`,
              },
            },
          },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: `${SERVICE_NAME}IPBasedThrottlingRule`,
          },
        },
      ],
    })

    const region = cdk.Stack.of(this).region
    const apiArn = `arn:aws:apigateway:${region}::/restapis/${api.restApiId}/stages/${api.deploymentStage.stageName}`

    new aws_waf.CfnWebACLAssociation(this, `${SERVICE_NAME}IPThrottlingAssociation`, {
      resourceArn: apiArn,
      webAclArn: ipThrottlingACL.getAtt('Arn').toString(),
    })

    const getOrdersLambdaIntegration = new aws_apigateway.LambdaIntegration(getOrdersLambdaAlias, {})
    const postOrderLambdaIntegration = new aws_apigateway.LambdaIntegration(postOrderLambdaAlias, {})
    const deleteOrderLambdaIntegration = new aws_apigateway.LambdaIntegration(deleteOrderLambdaAlias, {})
    const getNonceLambdaIntegration = new aws_apigateway.LambdaIntegration(getNonceLambdaAlias, {})
    const getDocsLambdaIntegration = new aws_apigateway.LambdaIntegration(getDocsLambdaAlias, {})
    const getDocsUILambdaIntegration = new aws_apigateway.LambdaIntegration(getDocsUILambdaAlias, {})

    const dutchAuction = api.root.addResource('dutch-auction', {
      defaultCorsPreflightOptions: {
        allowOrigins: aws_apigateway.Cors.ALL_ORIGINS,
        allowMethods: aws_apigateway.Cors.ALL_METHODS,
      },
    })

    const apiDocs = api.root.addResource('docs', {
      defaultCorsPreflightOptions: {
        allowOrigins: aws_apigateway.Cors.ALL_ORIGINS,
        allowMethods: aws_apigateway.Cors.ALL_METHODS,
      },
    })
    apiDocs.addMethod('GET', getDocsLambdaIntegration)

    const apiDocsUI = api.root.addResource('api-docs', {
      defaultCorsPreflightOptions: {
        allowOrigins: aws_apigateway.Cors.ALL_ORIGINS,
        allowMethods: aws_apigateway.Cors.ALL_METHODS,
      },
    })
    apiDocsUI.addMethod('GET', getDocsUILambdaIntegration)
    
    const order = dutchAuction.addResource('order')
    order.addMethod('POST', postOrderLambdaIntegration)
    order.addMethod('DELETE', deleteOrderLambdaIntegration)

    const orders = dutchAuction.addResource('orders')
    const nonce = dutchAuction.addResource('nonce')
    orders.addMethod('GET', getOrdersLambdaIntegration, {})
    nonce.addMethod('GET', getNonceLambdaIntegration, {})

    const apiAlarm5xx = new aws_cloudwatch.Alarm(this, `${SERVICE_NAME}-5XXAlarm`, {
      metric: api.metricServerError({
        period: Duration.minutes(5),
        // For this metric 'avg' represents error rate.
        statistic: 'avg',
      }),
      threshold: 0.05,
      // Beta has much less traffic so is more susceptible to transient errors.
      evaluationPeriods: stage == STAGE.BETA ? 5 : 3,
    })

    const apiAlarm4xx = new aws_cloudwatch.Alarm(this, `${SERVICE_NAME}-4XXAlarm`, {
      metric: api.metricClientError({
        period: Duration.minutes(5),
        statistic: 'avg',
      }),
      threshold: 0.8,
      evaluationPeriods: 3,
    })

    const apiAlarmLatency = new aws_cloudwatch.Alarm(this, `${SERVICE_NAME}-Latency`, {
      metric: api.metricLatency({
        period: Duration.minutes(5),
        statistic: 'p90',
      }),
      threshold: 7500,
      evaluationPeriods: 3,
    })

    if (chatbotSNSArn) {
      const chatBotTopic = aws_sns.Topic.fromTopicArn(this, `${SERVICE_NAME}ChatbotTopic`, chatbotSNSArn)
      apiAlarm5xx.addAlarmAction(new aws_cloudwatch_actions.SnsAction(chatBotTopic))
      apiAlarm4xx.addAlarmAction(new aws_cloudwatch_actions.SnsAction(chatBotTopic))
      apiAlarmLatency.addAlarmAction(new aws_cloudwatch_actions.SnsAction(chatBotTopic))
    }

    this.url = new CfnOutput(this, 'Url', {
      value: api.url,
    })
  }
}
