import * as cdk from 'aws-cdk-lib'
import { aws_lambda, aws_logs, Duration } from 'aws-cdk-lib'
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs'
import { CfnStateMachine } from 'aws-cdk-lib/aws-stepfunctions'
import { Construct } from 'constructs'
import path from 'path'
import { checkDefined } from '../../lib/preconditions/preconditions'
import { STAGE } from '../../lib/util/stage'
import { SERVICE_NAME } from '../constants'
import orderStatusTrackingStateMachine from '../definitions/order-tracking-sfn.json'
import { Alarm, ComparisonOperator, Metric, Statistic, TreatMissingData } from 'aws-cdk-lib/aws-cloudwatch'

export class StepFunctionStack extends cdk.NestedStack {
  public statusTrackingStateMachine: CfnStateMachine

  constructor(
    parent: Construct,
    name: string,
    props: cdk.NestedStackProps & {
      envVars: { [key: string]: string }
      stage: STAGE
      lambdaRole: cdk.aws_iam.Role
    }
  ) {
    super(parent, name, props)
    const { stage } = props

    const stateMachineRole = new cdk.aws_iam.Role(this, `StepFunctionRole`, {
      assumedBy: new cdk.aws_iam.ServicePrincipal('states.amazonaws.com'),
      managedPolicies: [
        cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaRole'),
        cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchLogsFullAccess')
      ],
    })

    const checkStatusFunction = new NodejsFunction(this, `${SERVICE_NAME}-${stage}-CheckOrderStatusLambda`, {
      runtime: aws_lambda.Runtime.NODEJS_16_X,
      role: props.lambdaRole,
      entry: path.join(__dirname, '../../lib/handlers/index.ts'),
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

    /* Subscription Filter Initialization */
    // TODO: remove the if block after accounts are set up for parameterization-api
    if (props.envVars['FILL_EVENT_DESTINATION_ARN']) {
      new aws_logs.CfnSubscriptionFilter(this, 'TerminalStateSub', {
        destinationArn: checkDefined(props.envVars['FILL_EVENT_DESTINATION_ARN']),
        filterPattern: '{ $.orderInfo.orderStatus = "filled" }',
        logGroupName: checkStatusFunction.logGroup.logGroupName,
      })
    }

    this.statusTrackingStateMachine = new CfnStateMachine(this, `${SERVICE_NAME}-${stage}-OrderStatusTracking`, {
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
      }
    })

    new Alarm(this, 'CheckOrderStatusStepFunctionExecutionFail', {
      alarmName: 'CheckOrderStatusStepFunctionExecutionFail',
      metric:
        new Metric({
          metricName: 'ExecutionsFailed',
          namespace: 'AWS/States',
          statistic: Statistic.SUM,
          dimensionsMap: {
            StateMachineArn: checkStatusFunction.logGroup.logGroupArn
          },
        }),
      threshold: 5, // TODO: remove placeholder threshold
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      treatMissingData: TreatMissingData.MISSING,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    });
  }
}
