import * as sfn from 'aws-cdk-lib/aws-stepfunctions'
import * as cdk from 'aws-cdk-lib'
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks'
import * as logs from 'aws-cdk-lib/aws-logs';
import { aws_lambda, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { SERVICE_NAME } from '../constants';
import path from 'path';
import { ORDER_STATUS } from '../../lib/handlers/types/order';
import { STAGE } from '../../lib/util/stage';
import orderStatusTrackingStateMachine from './state-json-definitions/order-status-tracking.asl.json'
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { CfnStateMachine } from 'aws-cdk-lib/aws-stepfunctions';

export class StateMachineStack extends cdk.Stack {
  public stateMachineARN: string;

  constructor(
    parent: Construct,
    name: string,
    props: cdk.StackProps & {
      envVars: {[key: string]: string};
      stage: STAGE,
    }
  ) {
    super(parent, name, props);
    const { stage } = props;
    
    const stateMachineRole = new cdk.aws_iam.Role(this, `StateMachine-Role`, {
      assumedBy: new cdk.aws_iam.ServicePrincipal('states.amazonaws.com'),
      managedPolicies: [
        cdk.aws_iam.ManagedPolicy.fromManagedPolicyArn(this, `StateMachineDynamoDbFullAccess`, "arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess"),
        cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaRole')
      ],
    });

    // check order status lambda
    new NodejsFunction(this, `${SERVICE_NAME}-Stage-${stage}-CheckOrderStatusLambda`, {
      //no permissions needed
      //role: lambdaRole,
      runtime: aws_lambda.Runtime.NODEJS_16_X,
      entry: path.join(__dirname, '../../lib/handlers/index.ts'),
      handler: 'checkOrderStatusHandler',
      memorySize: 512,
      bundling: {
        minify: true,
        sourceMap: true,
      },
      timeout: Duration.seconds(900),
      environment: {
        ...props.envVars
      },
    });
    
    const logGroup = new logs.LogGroup(this, name, { logGroupName: `${name}`});

    this.stateMachineARN = new CfnStateMachine(this, `${SERVICE_NAME}-Stage-${stage}-OrderStatusTracking`, {
      roleArn: stateMachineRole.roleArn,
      definition: orderStatusTrackingStateMachine,
      loggingConfiguration: {
        destinations: [{
          cloudWatchLogsLogGroup: {
            logGroupArn: logGroup.logGroupArn
          }
        }]
      }
    }).attrArn
  }
}

