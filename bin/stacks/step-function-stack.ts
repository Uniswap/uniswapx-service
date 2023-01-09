import * as cdk from 'aws-cdk-lib'
import { aws_iam, aws_lambda, aws_logs, Duration } from 'aws-cdk-lib'
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs'
import { CfnStateMachine } from 'aws-cdk-lib/aws-stepfunctions'
import { Construct } from 'constructs'
import path from 'path'
import { STAGE } from '../../lib/util/stage'
import { SERVICE_NAME } from '../constants'
import orderStatusTrackingStateMachine from '../definitions/order-tracking-sfn.json'

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
      managedPolicies: [cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaRole')],
    })

    if (stage === STAGE.LOCAL) {
      props.envVars['RPC_1'] = props.envVars['PRC_TENDERLY']
      props.envVars['REACTOR_1'] = props.envVars['PRC_TENDERLY']
    }

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

    const firehoseArn = props.envVars['FILL_EVENT_FIREHOSE']

    const subscriptionRole = new aws_iam.Role(this, 'SubscriptionRole', {
      assumedBy: new aws_iam.ServicePrincipal('logs.amazonaws.com'),
    })

    subscriptionRole.addToPolicy(
      new aws_iam.PolicyStatement({
        effect: aws_iam.Effect.ALLOW,
        actions: ['firehose:PutRecord', 'firehose:PutRecordBatch'],
        resources: [firehoseArn],
      })
    )
    new aws_logs.CfnSubscriptionFilter(this, 'TerminalStateSub', {
      destinationArn: firehoseArn,
      filterPattern: '{ $.orderInfo.orderStatus = "filled" }',
      logGroupName: checkStatusFunction.logGroup.logGroupName,
      roleArn: subscriptionRole.roleArn,
    })

    this.statusTrackingStateMachine = new CfnStateMachine(this, `${SERVICE_NAME}-${stage}-OrderStatusTracking`, {
      roleArn: stateMachineRole.roleArn,
      definition: orderStatusTrackingStateMachine,
      definitionSubstitutions: {
        checkOrderStatusLambdaArn: checkStatusFunction.functionArn,
      },
    })
  }
}
