import * as cdk from 'aws-cdk-lib'
import { Duration, RemovalPolicy, Size } from 'aws-cdk-lib'
import * as aws_iam from 'aws-cdk-lib/aws-iam'
import * as aws_firehose from 'aws-cdk-lib/aws-kinesisfirehose'
import * as aws_lambda from 'aws-cdk-lib/aws-lambda'
import * as aws_lambda_nodejs from 'aws-cdk-lib/aws-lambda-nodejs'
import * as aws_logs from 'aws-cdk-lib/aws-logs'
import * as aws_s3 from 'aws-cdk-lib/aws-s3'
import { Construct } from 'constructs'
import * as path from 'path'
import { STAGE } from '../../lib/util/stage'
import { FILTER_PATTERNS, SERVICE_NAME } from '../constants'
import { logRetentionDays } from './log-retention'

// Data Eng's loader (data-eng-workflows, uniswap_x space) reads the analytics buckets as this IAM user.
export const DATA_ENG_LOADER_PRINCIPAL_ARN = 'arn:aws:iam::867401673276:user/bq-load-sa'

// Data Eng lists objects under Firehose's default UTC prefix (YYYY/MM/DD/HH/), so the buckets
// need stable names and no prefix override.
export function analyticsBucketName(stage: STAGE, feed: 'posted-orders' | 'fills'): string {
  return `uniswapx-service-${stage}-analytics-${feed}`
}

// The post Lambdas put posted-order records straight onto this stream. Its name is fixed so the
// Lambda stack can name and grant it without a reference to this stack, which depends on the
// check-order-status Lambda's log group.
export function postedOrdersDirectStreamName(stage: STAGE): string {
  return `${SERVICE_NAME}-${stage}-PostedOrdersDirect`
}

export interface AnalyticsStackProps extends cdk.NestedStackProps {
  stage: STAGE
  checkStatusFunction: aws_lambda.Function
}

/**
 * S3 feeds of posted orders and terminal order states for Data Eng, one bucket each. The post
 * Lambdas put posted-order records straight onto a stream. Terminal states still come from logs:
 * a same-account subscription filter on the check-order-status log group delivers matching lines
 * through Firehose, where a processor unwraps the CloudWatch envelope down to the record.
 */
export class AnalyticsStack extends cdk.NestedStack {
  public readonly postedOrdersBucket: aws_s3.Bucket
  public readonly fillsBucket: aws_s3.Bucket

  constructor(scope: Construct, name: string, props: AnalyticsStackProps) {
    super(scope, name, props)
    const { stage, checkStatusFunction } = props

    this.postedOrdersBucket = this.createBucket('PostedOrdersBucket', stage, 'posted-orders')
    this.fillsBucket = this.createBucket('FillsBucket', stage, 'fills')

    const processor = new aws_lambda_nodejs.NodejsFunction(this, `${SERVICE_NAME}AnalyticsProcessor`, {
      runtime: aws_lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../../lib/handlers/analytics-firehose-processor/index.ts'),
      handler: 'handler',
      memorySize: 512,
      timeout: Duration.seconds(60),
      bundling: {
        minify: true,
        sourceMap: true,
      },
      environment: {
        NODE_OPTIONS: '--enable-source-maps',
        stage,
      },
      logRetention: logRetentionDays(stage),
    })

    const fillsStream = this.createStream('FillsStream', this.fillsBucket, processor, stage)
    this.createDirectStream(
      'PostedOrdersDirectStream',
      postedOrdersDirectStreamName(stage),
      this.postedOrdersBucket,
      stage
    )

    const subscriptionRole = new aws_iam.Role(this, 'LogsToFirehoseRole', {
      assumedBy: new aws_iam.ServicePrincipal('logs.amazonaws.com'),
    })
    const grant = fillsStream.grantPutRecords(subscriptionRole)

    const filter = this.subscribe(
      'TerminalStateFeed',
      checkStatusFunction,
      fillsStream,
      FILTER_PATTERNS.TERMINAL_ORDER_STATE,
      subscriptionRole
    )
    // CloudWatch validates the role can write to the stream when the filter is created.
    grant.applyBefore(filter)
  }

  private createBucket(id: string, stage: STAGE, feed: 'posted-orders' | 'fills'): aws_s3.Bucket {
    const shared = stage !== STAGE.LOCAL
    const bucket = new aws_s3.Bucket(this, id, {
      bucketName: shared ? analyticsBucketName(stage, feed) : undefined,
      blockPublicAccess: aws_s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      // History must survive stack replacement: Data Eng backfills re-read old hours.
      removalPolicy: RemovalPolicy.RETAIN,
    })
    if (shared) {
      bucket.grantRead(new aws_iam.ArnPrincipal(DATA_ENG_LOADER_PRINCIPAL_ARN))
    }
    return bucket
  }

  private createStream(
    id: string,
    bucket: aws_s3.Bucket,
    processor: aws_lambda.Function,
    stage: STAGE
  ): aws_firehose.DeliveryStream {
    return new aws_firehose.DeliveryStream(this, id, {
      destination: new aws_firehose.S3Bucket(bucket, {
        bufferingInterval: Duration.seconds(300),
        bufferingSize: Size.mebibytes(5),
        compression: aws_firehose.Compression.UNCOMPRESSED,
        processor: new aws_firehose.LambdaFunctionProcessor(processor, {
          bufferInterval: Duration.seconds(60),
          bufferSize: Size.mebibytes(1),
          retries: 3,
        }),
        loggingConfig: new aws_firehose.EnableLogging(
          new aws_logs.LogGroup(this, `${id}Logs`, { retention: logRetentionDays(stage) })
        ),
      }),
    })
  }

  // Producers write records that are already in their loaded form, so there is no processor.
  // Buffering and layout match createStream's.
  private createDirectStream(
    id: string,
    deliveryStreamName: string,
    bucket: aws_s3.Bucket,
    stage: STAGE
  ): aws_firehose.DeliveryStream {
    return new aws_firehose.DeliveryStream(this, id, {
      deliveryStreamName,
      destination: new aws_firehose.S3Bucket(bucket, {
        bufferingInterval: Duration.seconds(300),
        bufferingSize: Size.mebibytes(5),
        compression: aws_firehose.Compression.UNCOMPRESSED,
        loggingConfig: new aws_firehose.EnableLogging(
          new aws_logs.LogGroup(this, `${id}Logs`, { retention: logRetentionDays(stage) })
        ),
      }),
    })
  }

  private subscribe(
    id: string,
    producer: aws_lambda.Function,
    stream: aws_firehose.DeliveryStream,
    filterPattern: string,
    role: aws_iam.Role
  ): aws_logs.CfnSubscriptionFilter {
    return new aws_logs.CfnSubscriptionFilter(this, id, {
      logGroupName: producer.logGroup.logGroupName,
      destinationArn: stream.deliveryStreamArn,
      roleArn: role.roleArn,
      filterPattern,
    })
  }
}
