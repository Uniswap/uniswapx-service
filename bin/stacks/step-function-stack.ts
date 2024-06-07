import * as cdk from 'aws-cdk-lib'
import { aws_lambda, aws_logs, Duration } from 'aws-cdk-lib'
import { Alarm, ComparisonOperator, MathExpression, Metric, TreatMissingData } from 'aws-cdk-lib/aws-cloudwatch'
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs'
import { CfnStateMachine } from 'aws-cdk-lib/aws-stepfunctions'
import { Construct } from 'constructs'
import path from 'path'
import { checkDefined } from '../../lib/preconditions/preconditions'
import { SUPPORTED_CHAINS } from '../../lib/util/chain'
import { STAGE } from '../../lib/util/stage'
import { SERVICE_NAME } from '../constants'
import orderStatusTrackingStateMachine from '../definitions/order-tracking-sfn.json'

export class StepFunctionStack extends cdk.NestedStack {
  public chainIdToStatusTrackingStateMachineArn: { [key: string]: string } = {}
  public checkStatusFunction: cdk.aws_lambda_nodejs.NodejsFunction

  constructor(
    parent: Construct,
    name: string,
    props: cdk.NestedStackProps & {
      envVars: { [key: string]: string }
      stage: STAGE
      lambdaRole: cdk.aws_iam.Role
      chatbotSNSArn?: string
    }
  ) {
    super(parent, name, props)
    const { stage, chatbotSNSArn } = props

    const stateMachineRole = new cdk.aws_iam.Role(this, `StepFunctionRole`, {
      assumedBy: new cdk.aws_iam.ServicePrincipal('states.amazonaws.com'),
      managedPolicies: [
        cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaRole'),
        cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchLogsFullAccess'),
      ],
    })

    const checkStatusFunction = new NodejsFunction(this, `${SERVICE_NAME}-${stage}-CheckOrderStatusLambda`, {
      runtime: aws_lambda.Runtime.NODEJS_18_X,
      role: props.lambdaRole,
      entry: path.join(__dirname, '../../lib/handlers/check-order-status/index.ts'),
      handler: 'checkOrderStatusHandler',
      memorySize: 512,
      bundling: {
        minify: true,
        sourceMap: true,
      },
      timeout: Duration.seconds(60),
      environment: {
        VERSION: '2',
        NODE_OPTIONS: '--enable-source-maps',
        ...props.envVars,
        stage: stage,
      },
    })
    this.checkStatusFunction = checkStatusFunction

    /* Subscription Filter Initialization */
    // This grabs log groups with the matching filter pattern and sends them
    // to the parameterization-service where the analytics stack lives
    // TODO: remove the if block after accounts are set up for parameterization-api
    if (props.envVars['FILL_EVENT_DESTINATION_ARN']) {
      new aws_logs.CfnSubscriptionFilter(this, 'TerminalStateSub', {
        destinationArn: checkDefined(props.envVars['FILL_EVENT_DESTINATION_ARN']),
        // filter patterns should match ORDER_STATUS.FILLED, ORDER_STATUS.CANCELLED
        filterPattern: '{ $.orderInfo.orderStatus = "filled" || $.orderInfo.orderStatus = "cancelled" }',
        logGroupName: checkStatusFunction.logGroup.logGroupName,
      })

      new aws_logs.CfnSubscriptionFilter(this, 'nonTerminalSub', {
        destinationArn: checkDefined(props.envVars['ACTIVE_ORDER_EVENT_DESTINATION_ARN']),
        filterPattern: '{ $.orderInfo.orderStatus = "insufficient-funds" }',
        logGroupName: checkStatusFunction.logGroup.logGroupName,
      })
    }

    // We define a separate sfn for each chain so we can easily use step function metrics per chain
    for (const chainId of SUPPORTED_CHAINS) {
      const stateMachine = new CfnStateMachine(this, `${SERVICE_NAME}-${stage}-OrderStatusTracking-${chainId}`, {
        roleArn: stateMachineRole.roleArn,
        definition: orderStatusTrackingStateMachine,
        definitionSubstitutions: {
          checkOrderStatusLambdaArn: checkStatusFunction.functionArn,
        },
        // Since the checkOrderStatus already posts logs, we only want to post failure logs from the state machine
        loggingConfiguration: {
          level: 'ERROR',
          includeExecutionData: true,
          destinations: [
            {
              cloudWatchLogsLogGroup: {
                logGroupArn: checkStatusFunction.logGroup.logGroupArn,
              },
            },
          ],
        },
      })

      this.chainIdToStatusTrackingStateMachineArn[chainId] = stateMachine.attrArn

      const METRIC_DIMENSION_MAP = {
        StateMachineArn: stateMachine.attrArn,
      }

      const successRateMetric = new MathExpression({
        expression: '100*((m1+m2+m3+m4)/m5)',
        period: Duration.minutes(15),
        usingMetrics: {
          m1: new Metric({
            namespace: 'AWS/States',
            metricName: `ExecutionThrottled`,
            dimensionsMap: METRIC_DIMENSION_MAP,
            statistic: 'sum',
          }),
          m2: new Metric({
            namespace: 'AWS/States',
            metricName: `ExecutionsFailed`,
            dimensionsMap: METRIC_DIMENSION_MAP,
            statistic: 'sum',
          }),
          m3: new Metric({
            namespace: 'AWS/States',
            metricName: `ExecutionsTimedOut`,
            dimensionsMap: METRIC_DIMENSION_MAP,
            statistic: 'sum',
          }),
          m4: new Metric({
            namespace: 'AWS/States',
            metricName: `ExecutionsAborted`,
            dimensionsMap: METRIC_DIMENSION_MAP,
            statistic: 'sum',
          }),
          m5: new Metric({
            namespace: 'AWS/States',
            metricName: `ExecutionsStarted`,
            dimensionsMap: METRIC_DIMENSION_MAP,
            statistic: 'sum',
          }),
        },
      })

      const sev2ErrorRate = new Alarm(this, `CheckOrderStatusSev2StepFunctionErrorRate-${chainId}`, {
        alarmName: `${SERVICE_NAME}-SEV2-${stage}-CheckOrderStatusStepFunctionErrorRate-${chainId}`,
        metric: successRateMetric,
        threshold: 10,
        evaluationPeriods: 1,
        datapointsToAlarm: 1,
        treatMissingData: TreatMissingData.IGNORE,
        comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      })

      const sev3ErrorRate = new Alarm(this, `CheckOrderStatusSev3StepFunctionErrorRate-${chainId}`, {
        alarmName: `${SERVICE_NAME}-SEV3-${stage}-CheckOrderStatusStepFunctionErrorRate-${chainId}`,
        metric: successRateMetric,
        threshold: 5,
        evaluationPeriods: 1,
        datapointsToAlarm: 1,
        treatMissingData: TreatMissingData.IGNORE,
        comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      })

      const expiredRateMetric = new MathExpression({
        expression: '100*m1/m2',
        period: Duration.minutes(15),
        usingMetrics: {
          m1: new Metric({
            namespace: 'AWS/States',
            metricName: `OrderSfn-expired-chain-${chainId}`,
            dimensionsMap: METRIC_DIMENSION_MAP,
            statistic: 'sum',
          }),
          m2: new Metric({
            namespace: 'AWS/States',
            metricName: `OrderSfn-filled-chain-${chainId}`,
            dimensionsMap: METRIC_DIMENSION_MAP,
            statistic: 'sum',
          }),
        },
      })

      const sev3ExpiredRate = new Alarm(this, `CheckOrderStatusSev3StepFunctionOrderExpiryRate-${chainId}`, {
        alarmName: `${SERVICE_NAME}-SEV3-${stage}-CheckOrderStatusStepFunctionOrderExpiryRate-${chainId}`,
        metric: expiredRateMetric,
        threshold: 5,
        evaluationPeriods: 1,
        datapointsToAlarm: 1,
        treatMissingData: TreatMissingData.IGNORE,
        comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      })

      const sev2ExpiredRate = new Alarm(this, `CheckOrderStatusSev2StepFunctionOrderExpiryRate-${chainId}`, {
        alarmName: `${SERVICE_NAME}-SEV2-${stage}-CheckOrderStatusStepFunctionOrderExpiryRate-${chainId}`,
        metric: expiredRateMetric,
        threshold: 20,
        evaluationPeriods: 1,
        datapointsToAlarm: 1,
        treatMissingData: TreatMissingData.IGNORE,
        comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      })

      if (chatbotSNSArn) {
        const chatBotTopic = cdk.aws_sns.Topic.fromTopicArn(this, 'ChatbotTopic', chatbotSNSArn)
        sev2ErrorRate.addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(chatBotTopic))
        sev3ErrorRate.addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(chatBotTopic))
        sev2ExpiredRate.addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(chatBotTopic))
        sev3ExpiredRate.addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(chatBotTopic))
      }
    }
  }
}
