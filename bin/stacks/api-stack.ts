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
import { DashboardStack } from './dashboard-stack'
import { IndexCapacityConfig, TableCapacityConfig } from './dynamo-stack'
import { LambdaStack } from './lambda-stack'

export class APIStack extends cdk.Stack {
  public readonly url: CfnOutput

  constructor(
    parent: Construct,
    name: string,
    props: cdk.StackProps & {
      provisionedConcurrency: number
      throttlingOverride?: string
      internalApiKey?: string
      chatbotSNSArn?: string
      stage: string
      envVars: { [key: string]: string }
      tableCapacityConfig: TableCapacityConfig
      indexCapacityConfig?: IndexCapacityConfig
    }
  ) {
    super(parent, name, props)

    const {
      throttlingOverride,
      chatbotSNSArn,
      stage,
      provisionedConcurrency,
      internalApiKey,
      tableCapacityConfig,
      indexCapacityConfig,
    } = props

    const {
      getOrdersLambdaAlias,
      getOrdersLambda,
      getNonceLambdaAlias,
      getNonceLambda,
      postOrderLambdaAlias,
      postOrderLambda,
      limitOrderPostOrderLambdaAlias,
      // limitOrderPostOrderLambda, TODO: dashboard
      getDocsLambdaAlias,
      getDocsUILambdaAlias,
      chainIdToStatusTrackingStateMachineArn,
      checkStatusFunction,
    } = new LambdaStack(this, `${SERVICE_NAME}LambdaStack`, {
      provisionedConcurrency,
      stage: stage as STAGE,
      envVars: props.envVars,
      tableCapacityConfig,
      indexCapacityConfig,
      chatbotSNSArn,
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
          name: 'allow-api-key',
          priority: 0,
          statement: {
            byteMatchStatement: {
              searchString: internalApiKey,
              fieldToMatch: {
                singleHeader: {
                  name: 'x-api-key',
                },
              },
              textTransformations: [
                {
                  priority: 0,
                  type: 'NONE',
                },
              ],
              positionalConstraint: 'EXACTLY',
            },
          },
          action: {
            allow: {},
          },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'allow-api-key',
          },
        },
        {
          name: 'ip-post-order',
          priority: 1,
          statement: {
            rateBasedStatement: {
              limit: throttlingOverride ? parseInt(throttlingOverride) : 300,
              aggregateKeyType: 'FORWARDED_IP',
              scopeDownStatement: {
                regexMatchStatement: {
                  regexString: 'order[^s]|order$',
                  fieldToMatch: {
                    uriPath: {},
                  },
                  textTransformations: [
                    {
                      priority: 0,
                      type: 'NONE',
                    },
                  ],
                },
              },
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
                customResponseBodyKey: 'GoudaServiceThrottledResponseBody',
              },
            },
          },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'ip-post-order',
          },
        },
        {
          name: 'ip-get-orders',
          priority: 2,
          statement: {
            rateBasedStatement: {
              limit: throttlingOverride ? parseInt(throttlingOverride) : 900,
              aggregateKeyType: 'FORWARDED_IP',
              scopeDownStatement: {
                byteMatchStatement: {
                  searchString: 'orders',
                  fieldToMatch: {
                    uriPath: {},
                  },
                  textTransformations: [
                    {
                      priority: 0,
                      type: 'NONE',
                    },
                  ],
                  positionalConstraint: 'CONTAINS',
                },
              },
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
                customResponseBodyKey: 'GoudaServiceThrottledResponseBody',
              },
            },
          },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'ip-get-orders',
          },
        },
        {
          name: 'ip-nonce',
          priority: 3,
          statement: {
            rateBasedStatement: {
              limit: throttlingOverride ? parseInt(throttlingOverride) : 450,
              aggregateKeyType: 'FORWARDED_IP',
              scopeDownStatement: {
                byteMatchStatement: {
                  searchString: 'nonce',
                  fieldToMatch: {
                    uriPath: {},
                  },
                  textTransformations: [
                    {
                      priority: 0,
                      type: 'NONE',
                    },
                  ],
                  positionalConstraint: 'CONTAINS',
                },
              },
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
                customResponseBodyKey: 'GoudaServiceThrottledResponseBody',
              },
            },
          },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'ip-nonce',
          },
        },
        {
          name: 'ip-docs',
          priority: 4,
          statement: {
            rateBasedStatement: {
              limit: throttlingOverride ? parseInt(throttlingOverride) : 100,
              aggregateKeyType: 'FORWARDED_IP',
              scopeDownStatement: {
                byteMatchStatement: {
                  searchString: 'docs.json',
                  fieldToMatch: {
                    uriPath: {},
                  },
                  textTransformations: [
                    {
                      priority: 0,
                      type: 'NONE',
                    },
                  ],
                  positionalConstraint: 'CONTAINS',
                },
              },
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
                customResponseBodyKey: 'GoudaServiceThrottledResponseBody',
              },
            },
          },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'ip-docs',
          },
        },
        {
          name: 'ip-api-docs',
          priority: 5,
          statement: {
            rateBasedStatement: {
              limit: throttlingOverride ? parseInt(throttlingOverride) : 100,
              aggregateKeyType: 'FORWARDED_IP',
              scopeDownStatement: {
                byteMatchStatement: {
                  searchString: 'api-docs',
                  fieldToMatch: {
                    uriPath: {},
                  },
                  textTransformations: [
                    {
                      priority: 0,
                      type: 'NONE',
                    },
                  ],
                  positionalConstraint: 'CONTAINS',
                },
              },
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
                customResponseBodyKey: 'GoudaServiceThrottledResponseBody',
              },
            },
          },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'ip-api-docs',
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
    const limitPostOrderLambdaIntegration = new aws_apigateway.LambdaIntegration(limitOrderPostOrderLambdaAlias, {})
    const getNonceLambdaIntegration = new aws_apigateway.LambdaIntegration(getNonceLambdaAlias, {})
    const getDocsLambdaIntegration = new aws_apigateway.LambdaIntegration(getDocsLambdaAlias, {})
    const getDocsUILambdaIntegration = new aws_apigateway.LambdaIntegration(getDocsUILambdaAlias, {})

    const dutchAuction = api.root.addResource('dutch-auction', {
      defaultCorsPreflightOptions: {
        allowOrigins: aws_apigateway.Cors.ALL_ORIGINS,
        allowMethods: aws_apigateway.Cors.ALL_METHODS,
      },
    })

    const limitOrders = api.root.addResource('limit-orders', {
      defaultCorsPreflightOptions: {
        allowOrigins: aws_apigateway.Cors.ALL_ORIGINS,
        allowMethods: aws_apigateway.Cors.ALL_METHODS,
      },
    })

    const apiDocs = api.root.addResource('docs.json', {
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

    const limitOrderOrder = limitOrders.addResource('order')
    limitOrderOrder.addMethod('POST', limitPostOrderLambdaIntegration)

    const orders = dutchAuction.addResource('orders')
    const nonce = dutchAuction.addResource('nonce')
    orders.addMethod('GET', getOrdersLambdaIntegration, {})
    nonce.addMethod('GET', getNonceLambdaIntegration, {})

    new DashboardStack(this, `${SERVICE_NAME}-Dashboard`, {
      apiName: api.restApiName,
      postOrderLambdaName: postOrderLambda.functionName,
      getNonceLambdaName: getNonceLambda.functionName,
      getOrdersLambdaName: getOrdersLambda.functionName,
      chainIdToStatusTrackingStateMachineArn,
      orderStatusLambdaName: checkStatusFunction.functionName,
    })

    const apiAlarm5xxSev2 = new aws_cloudwatch.Alarm(this, `${SERVICE_NAME}-SEV2-5XXAlarm`, {
      alarmName: `${SERVICE_NAME}-SEV2-5XXAlarm`,
      metric: api.metricServerError({
        period: Duration.minutes(5),
        // For this metric 'avg' represents error rate.
        statistic: 'avg',
      }),
      threshold: 0.05,
      // Beta has much less traffic so is more susceptible to transient errors.
      evaluationPeriods: stage == STAGE.BETA ? 5 : 3,
    })

    const apiAlarm5xxSev3 = new aws_cloudwatch.Alarm(this, `${SERVICE_NAME}-SEV3-5XXAlarm`, {
      alarmName: `${SERVICE_NAME}-SEV3-5XXAlarm`,
      metric: api.metricServerError({
        period: Duration.minutes(5),
        // For this metric 'avg' represents error rate.
        statistic: 'avg',
      }),
      threshold: 0.05,
      // Beta has much less traffic so is more susceptible to transient errors.
      evaluationPeriods: stage == STAGE.BETA ? 10 : 8,
      datapointsToAlarm: 3,
    })

    const apiAlarm4xxSev2 = new aws_cloudwatch.Alarm(this, `${SERVICE_NAME}-SEV2-4XXAlarm`, {
      alarmName: `${SERVICE_NAME}-SEV2-4XXAlarm`,
      metric: api.metricClientError({
        period: Duration.minutes(5),
        statistic: 'avg',
      }),
      threshold: 0.8,
      evaluationPeriods: 3,
    })

    const apiAlarm4xxSev3 = new aws_cloudwatch.Alarm(this, `${SERVICE_NAME}-SEV3-4XXAlarm`, {
      alarmName: `${SERVICE_NAME}-SEV3-4XXAlarm`,
      metric: api.metricClientError({
        period: Duration.minutes(5),
        statistic: 'avg',
      }),
      threshold: 0.5,
      evaluationPeriods: 3,
    })

    const apiAlarmLatencySev3 = new aws_cloudwatch.Alarm(this, `${SERVICE_NAME}-SEV3-Latency`, {
      alarmName: `${SERVICE_NAME}-SEV3-Latency`,
      metric: api.metricLatency({
        period: Duration.minutes(5),
        statistic: 'p90',
      }),
      threshold: 7500,
      evaluationPeriods: 3,
    })

    const apiAlarmLatencySev2 = new aws_cloudwatch.Alarm(this, `${SERVICE_NAME}-SEV2-Latency`, {
      alarmName: `${SERVICE_NAME}-SEV2-Latency`,
      metric: api.metricLatency({
        period: Duration.minutes(5),
        statistic: 'p90',
      }),
      threshold: 10000,
      evaluationPeriods: 3,
    })

    if (chatbotSNSArn) {
      const chatBotTopic = aws_sns.Topic.fromTopicArn(this, `${SERVICE_NAME}ChatbotTopic`, chatbotSNSArn)
      apiAlarm5xxSev2.addAlarmAction(new aws_cloudwatch_actions.SnsAction(chatBotTopic))
      apiAlarm5xxSev3.addAlarmAction(new aws_cloudwatch_actions.SnsAction(chatBotTopic))
      apiAlarm4xxSev2.addAlarmAction(new aws_cloudwatch_actions.SnsAction(chatBotTopic))
      apiAlarm4xxSev3.addAlarmAction(new aws_cloudwatch_actions.SnsAction(chatBotTopic))
      apiAlarmLatencySev3.addAlarmAction(new aws_cloudwatch_actions.SnsAction(chatBotTopic))
      apiAlarmLatencySev2.addAlarmAction(new aws_cloudwatch_actions.SnsAction(chatBotTopic))
    }

    this.url = new CfnOutput(this, 'Url', {
      value: api.url,
    })
  }
}
