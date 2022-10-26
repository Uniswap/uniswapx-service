import * as cdk from 'aws-cdk-lib'
import * as aws_iam from 'aws-cdk-lib/aws-iam'
import * as asg from 'aws-cdk-lib/aws-applicationautoscaling';
import * as aws_lambda from 'aws-cdk-lib/aws-lambda'
import * as aws_lambda_nodejs from 'aws-cdk-lib/aws-lambda-nodejs'
import { Construct } from 'constructs'
import * as path from 'path'
import { SERVICE_NAME } from '../constants'
import { DynamoStack } from './dynamo-stack'

export interface LambdaStackProps extends cdk.NestedStackProps {
  envVars: { [key: string]: string };
  provisionedConcurrency: number
  chatbotSNSArn?: string
}
export class LambdaStack extends cdk.NestedStack {
  public readonly postOrderLambda: aws_lambda_nodejs.NodejsFunction;
  public readonly postOrderLambdaAlias: aws_lambda.Alias;

  constructor(scope: Construct, name: string, props: LambdaStackProps) {
    super(scope, name, props)
    const { provisionedConcurrency } = props;

    const lambdaName = `${SERVICE_NAME}Lambda`

    const lambdaRole = new aws_iam.Role(this, `${lambdaName}-LambdaRole`, {
      assumedBy: new aws_iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        aws_iam.ManagedPolicy.fromAwsManagedPolicyName('AWSStepFunctionsFullAccess'),
        aws_iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonDynamoDBFullAccess'),
        aws_iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
      ],
    });

    // setup DynamoDb
    new DynamoStack(this, `${SERVICE_NAME}DynamoStack`, {});

    console.log(props.envVars)
    // POST Order Lambda
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
        ...props.envVars,
        VERSION: '2',
        NODE_OPTIONS: '--enable-source-maps',
      },
    });

    const enableProvisionedConcurrency = provisionedConcurrency > 0;

    this.postOrderLambdaAlias = new aws_lambda.Alias(this, `PostOrderLiveAlias`, {
      aliasName: 'live',
      version: this.postOrderLambda.currentVersion,
      provisionedConcurrentExecutions: enableProvisionedConcurrency ? provisionedConcurrency : undefined,
    });

    if (enableProvisionedConcurrency) {
      const postOrderTarget = new asg.ScalableTarget(this, `${lambdaName}-PostOrder-ProvConcASG`, {
        serviceNamespace: asg.ServiceNamespace.LAMBDA,
        maxCapacity: provisionedConcurrency * 5,
        minCapacity: provisionedConcurrency,
        resourceId: `function:${this.postOrderLambdaAlias.lambda.functionName}:${this.postOrderLambdaAlias.aliasName}`,
        scalableDimension: 'lambda:function:ProvisionedConcurrency',
      });

      postOrderTarget.node.addDependency(this.postOrderLambdaAlias);
      postOrderTarget.scaleToTrackMetric(`${lambdaName}-PostOrder-ProvConcTracking`, {
        targetValue: 0.8,
        predefinedMetric: asg.PredefinedMetric.LAMBDA_PROVISIONED_CONCURRENCY_UTILIZATION,
      });
    }
  }
}

