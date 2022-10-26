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
      ],
    });
    const checkOrderStatusLambda = new NodejsFunction(this, `${SERVICE_NAME}-Stage-${stage}-CheckOrderStatusLambda`, {
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
      
    const checkOrderStatusStep = new tasks.LambdaInvoke(this, `${SERVICE_NAME}-Check-Order-Status`, {
      lambdaFunction: checkOrderStatusLambda,
      // Lambda's result is in the attribute `filledOrders`
      resultPath: '$.prevCheckOrderOutput',
    })

    // States language JSON to put an item into DynamoDB
    // snippet generated from https://docs.aws.amazon.com/step-functions/latest/dg/tutorial-code-snippet.html#tutorial-code-snippet-1
    const orderStatusStateJson = {
      "Type": "Task",
      "Resource": "arn:aws:states:::dynamodb:updateItem",
      "ResultPath": "$.updateOrderStatusOutput",
      "Parameters": {
        "TableName": "Orders",
        "Key": {
          "orderHash": {
            "S.$": "$.orderHash"
          }
        },
        "UpdateExpression": "SET orderStatus = :orderStatus",
        "ExpressionAttributeValues": {
          ":orderStatus": {
            "S.$": "$.prevCheckOrderOutput.Payload.orderStatus"
          }
        },
      },
    };

    const waitStep = new sfn.Wait(this, `${SERVICE_NAME}-WaitStep`, {time: sfn.WaitTime.duration(Duration.seconds(10))})
      .next(checkOrderStatusStep)

    const succeedStep = new sfn.Succeed(this, `${SERVICE_NAME}-OrderInTerminalState`)

    // custom step which represents a task to update the order status in DynamoDB
    const updateOrderStatusStep = new sfn.CustomState(this, `${SERVICE_NAME}-UpdateOrderStatusStep`, {
      stateJson: orderStatusStateJson,
    });

    const checkTerminalStatusStep = new sfn.Choice(this, `${SERVICE_NAME}-OrderStatusTerminal?`)
      .when(sfn.Condition.stringEquals('$.prevCheckOrderOutput.Payload.orderStatus', ORDER_STATUS.OPEN), waitStep)
      .when(sfn.Condition.stringEquals('$.prevCheckOrderOutput.Payload.orderStatus', ORDER_STATUS.FILLED), succeedStep)
      .when(sfn.Condition.stringEquals('$.prevCheckOrderOutput.Payload.orderStatus', ORDER_STATUS.CANCELLED), succeedStep)
      .when(sfn.Condition.stringEquals('$.prevCheckOrderOutput.Payload.orderStatus', ORDER_STATUS.EXPIRED), succeedStep)

    const definition = checkOrderStatusStep.next(new sfn.Choice(this, `${SERVICE_NAME}-OrderStatusChanged?`)
      .when(sfn.Condition.booleanEquals('$.prevCheckOrderOutput.Payload.orderStatusChanged', true), updateOrderStatusStep.next(checkTerminalStatusStep))
      .otherwise(waitStep)
    )

    // prefix for vended logging
    const prefix = '/aws/vendedlogs/states/'
    const logGroup = new logs.LogGroup(this, name, { logGroupName: `${prefix}${name}`});

    this.stateMachineARN = new sfn.StateMachine(this, `${SERVICE_NAME}-Stage-${stage}-StatusTracking-StateMachine`, {
      role: stateMachineRole,
      definition: sfn.Chain.start(definition),
      logs: {
        destination: logGroup,
        level: sfn.LogLevel.ALL,
      },
    }).stateMachineArn;
  }
}

