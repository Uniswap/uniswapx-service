import * as cdk from 'aws-cdk-lib'
import * as aws_dynamo from 'aws-cdk-lib/aws-dynamodb'
import * as aws_iam from 'aws-cdk-lib/aws-iam'
import { Construct } from 'constructs'
import { CHAIN_OWNERS_KEY, chainOwnersBucketName } from '../../lib/chain-owners/location'
import { BETA_WEBHOOK_CONFIG_KEY, PRODUCTION_WEBHOOK_CONFIG_KEY, WEBHOOK_CONFIG_BUCKET } from '../../lib/util/constants'
import { STAGE } from '../../lib/util/stage'
import { postedOrdersDirectStreamName } from './analytics-stack'

/**
 * Backend monorepo accounts allowed to assume the cross-account roles, per gouda stage.
 * Beta pairs with backend dev + staging; prod pairs with backend prod only. A stage never trusts
 * an account from another tier, so a dev task role can never reach the prod Orders table.
 */
export const BACKEND_ACCOUNTS: Record<STAGE, readonly string[]> = {
  [STAGE.BETA]: ['411170392337', '413367642260'],
  [STAGE.PROD]: ['654200013602'],
  [STAGE.LOCAL]: [],
}

/**
 * The backend service's ECS task role is `<serviceShortName>-ecsTaskRole` with a Pulumi suffix,
 * i.e. `uniswapx-ecsTaskRole-<suffix>` (backend `buildEcsTaskRole`, shortName `uniswapx`). It does
 * not exist until the service's first deploy, so trust is pinned to the account plus this name
 * pattern rather than to an exact ARN. Deliberately not `uniswapx-*`: that would also admit every
 * other `uniswapx-`-prefixed role in the backend account (other services, deploy/CI roles), and
 * would let any of them assume the write role regardless of the backend side's cutover flag.
 * Tightening to the exact ARN after first deploy is a one-line change here.
 */
export const BACKEND_ROLE_NAME_PATTERN = 'uniswapx-ecsTaskRole-*'

export type CrossAccountRoleKind = 'shadow-read' | 'orders-write'

export function crossAccountRoleName(stage: STAGE, kind: CrossAccountRoleKind): string {
  return `uniswapx-${kind}-${stage}`
}

// Used first: the shadow comparator diffs the new status tracker's output against the live
// tables. Point reads and queries only, plus the metadata call the SDK makes on connect.
export const SHADOW_READ_ACTIONS = [
  'dynamodb:GetItem',
  'dynamodb:BatchGetItem',
  'dynamodb:Query',
  'dynamodb:DescribeTable',
] as const

// The comparator also tails the tables' streams to see writes as the legacy tracker makes them.
export const STREAM_READ_ACTIONS = [
  'dynamodb:DescribeStream',
  'dynamodb:GetRecords',
  'dynamodb:GetShardIterator',
  'dynamodb:ListStreams',
] as const

// Used after cutover: the new status tracker writes order state transitions, and the ported post
// path writes the order and its nonce in one transaction (TransactWriteItems is authorized per
// item, by these same actions). Every write is conditional, hence ConditionCheckItem. No Delete,
// no Scan, no batch writes. Revoking this role (or its trust) is an instant rollback to the
// legacy writer.
export const ORDERS_WRITE_ACTIONS = [
  'dynamodb:PutItem',
  'dynamodb:UpdateItem',
  'dynamodb:GetItem',
  'dynamodb:Query',
  'dynamodb:ConditionCheckItem',
] as const

// The ported post path starts the order's legacy tracking run, as legacy's post path does, on a
// chain whose tracking is still legacy's. Step Functions has no resource policies, so this can
// only be granted to a role in this account. No Stop, no Describe, no other state machine.
export const START_TRACKING_ACTIONS = ['states:StartExecution'] as const

// Both sides read the chain owner file (see lib/chain-owners/location.ts) before they post or
// write a status. Read only: the file is edited by hand, never by either service.
export const OWNER_FILE_READ_ACTIONS = ['s3:GetObject'] as const

// The ported post path sends legacy's immediate notice to an order's exclusive filler, so it reads
// the same webhook list legacy's post Lambda reads. Read only, and the write role only: the list
// carries the fillers' endpoints and their auth headers, and nothing reads it before a post.
export const WEBHOOK_LIST_READ_ACTIONS = ['s3:GetObject'] as const

// The ported post path puts each posted order's analytics record on the stream legacy's post
// Lambdas put to (analytics-stack.ts). Firehose has no resource policies, so a cross-account write
// needs a role in this account. The backend's analytics writer sends batches, hence both actions.
export const POSTED_ORDERS_PUT_ACTIONS = ['firehose:PutRecord', 'firehose:PutRecordBatch'] as const

/**
 * The webhook list object a stage's post and notification Lambdas read (post-order/lambda.ts and
 * order-notification/injector.ts build the same bucket and key). The bucket was made by hand, one
 * per stage in that stage's account, so there is no construct to reference.
 */
export function webhookListLocation(stage: STAGE): { bucket: string; key: string } {
  return {
    bucket: `${WEBHOOK_CONFIG_BUCKET}-${stage}-1`,
    key: stage === STAGE.BETA ? BETA_WEBHOOK_CONFIG_KEY : PRODUCTION_WEBHOOK_CONFIG_KEY,
  }
}

export interface IamStackProps extends cdk.NestedStackProps {
  stage: STAGE
  ordersTable: aws_dynamo.ITable
  limitOrdersTable: aws_dynamo.ITable
  noncesTable: aws_dynamo.ITable
  // One per chain (step-function-stack.ts).
  trackingStateMachineArns: string[]
}

/**
 * Cross-account IAM roles for the UniswapX service being built in the backend monorepo
 * (ECO-861). Created for beta and prod only (see BACKEND_ACCOUNTS). Two roles, scoped to the
 * order service's three tables, its tracking state machines, the chain owner file, and for the
 * write role the two other things a post touches (the webhook list and the posted-orders stream):
 *
 * - `uniswapx-shadow-read-<stage>`: read Orders, LimitOrders (with indexes and streams) and
 *   Nonces, and the owner file
 * - `uniswapx-orders-write-<stage>`: conditional writes to the three tables + the reads needed to
 *   make them, starting a tracking run, the owner file, reading the webhook list, and putting
 *   posted-order analytics records
 *
 * This arrangement is transitional: it exists so posting and status tracking can move to the
 * monorepo one chain at a time before the tables do. It goes away with the DynamoDB migration.
 * Nothing here touches any other table.
 */
export class IamStack extends cdk.NestedStack {
  public readonly shadowReadRole: aws_iam.Role
  public readonly ordersWriteRole: aws_iam.Role

  constructor(scope: Construct, name: string, props: IamStackProps) {
    super(scope, name, props)
    const { stage, ordersTable, limitOrdersTable, noncesTable, trackingStateMachineArns } = props

    const accounts = BACKEND_ACCOUNTS[stage]
    if (accounts.length === 0) {
      // A nested stack with no resources is rejected by CloudFormation at deploy time (synth
      // only validates top-level templates), so the caller must not create this stack for a
      // stage with nothing to trust. APIStack gates on BACKEND_ACCOUNTS before constructing it.
      throw new Error(`IamStack: stage '${stage}' has no backend accounts to trust; do not create it`)
    }

    const orderTables = [ordersTable, limitOrdersTable]
    // Nonces has no indexes, and nothing needs its (absent) stream.
    const tableArns = [...orderTables.flatMap((t) => [t.tableArn, `${t.tableArn}/index/*`]), noncesTable.tableArn]
    const streamArns = orderTables.map((t) => {
      if (!t.tableStreamArn) {
        throw new Error(`${t.tableName} has no stream; the shadow comparator needs one`)
      }
      return t.tableStreamArn
    })
    if (trackingStateMachineArns.length === 0) {
      throw new Error('IamStack: no tracking state machines to grant StartExecution on')
    }
    const account = cdk.Stack.of(this).account
    const ownerFileArn = `arn:aws:s3:::${chainOwnersBucketName(account)}/${CHAIN_OWNERS_KEY}`
    // Bucket names are global and this one is derived, not created here: until the owner file's
    // stack creates it, anyone could register the name and serve their own file. Pinning the
    // read to buckets owned by this account means a squatted bucket can never be read.
    const readOwnerFile = () =>
      new aws_iam.PolicyStatement({
        actions: [...OWNER_FILE_READ_ACTIONS],
        resources: [ownerFileArn],
        conditions: { StringEquals: { 's3:ResourceAccount': account } },
      })

    this.shadowReadRole = this.createRole('ShadowRead', stage, 'shadow-read', accounts, [
      new aws_iam.PolicyStatement({ actions: [...SHADOW_READ_ACTIONS], resources: tableArns }),
      new aws_iam.PolicyStatement({ actions: [...STREAM_READ_ACTIONS], resources: streamArns }),
      readOwnerFile(),
    ])

    const webhookList = webhookListLocation(stage)
    const postedOrdersStreamArn = cdk.Stack.of(this).formatArn({
      service: 'firehose',
      resource: 'deliverystream',
      // Named, not referenced, as the post Lambdas' own grant is (lambda-stack.ts).
      resourceName: postedOrdersDirectStreamName(stage),
    })

    this.ordersWriteRole = this.createRole('OrdersWrite', stage, 'orders-write', accounts, [
      new aws_iam.PolicyStatement({ actions: [...ORDERS_WRITE_ACTIONS], resources: tableArns }),
      new aws_iam.PolicyStatement({ actions: [...START_TRACKING_ACTIONS], resources: trackingStateMachineArns }),
      readOwnerFile(),
      new aws_iam.PolicyStatement({
        sid: 'ReadWebhookList',
        actions: [...WEBHOOK_LIST_READ_ACTIONS],
        resources: [`arn:aws:s3:::${webhookList.bucket}/${webhookList.key}`],
        // The bucket isn't created here, so pin the read to a bucket this account owns.
        conditions: { StringEquals: { 's3:ResourceAccount': account } },
      }),
      new aws_iam.PolicyStatement({ actions: [...POSTED_ORDERS_PUT_ACTIONS], resources: [postedOrdersStreamArn] }),
    ])

    new cdk.CfnOutput(this, 'ShadowReadRoleArn', { value: this.shadowReadRole.roleArn })
    new cdk.CfnOutput(this, 'OrdersWriteRoleArn', { value: this.ordersWriteRole.roleArn })
  }

  private createRole(
    id: string,
    stage: STAGE,
    kind: CrossAccountRoleKind,
    accounts: readonly string[],
    statements: aws_iam.PolicyStatement[]
  ): aws_iam.Role {
    // One trust statement per backend account, each narrowed to that account's own uniswapx-*
    // task roles, so no statement is broader than the account it names.
    const assumedBy = new aws_iam.CompositePrincipal(
      ...accounts.map((account) =>
        new aws_iam.AccountPrincipal(account).withConditions({
          ArnLike: { 'aws:PrincipalArn': `arn:aws:iam::${account}:role/${BACKEND_ROLE_NAME_PATTERN}` },
        })
      )
    )
    const role = new aws_iam.Role(this, `${id}Role`, {
      roleName: crossAccountRoleName(stage, kind),
      assumedBy,
      description: `UniswapX backend-monorepo ${kind} access to the order service's tables, tracking and owner file (ECO-861, transitional)`,
    })
    role.attachInlinePolicy(new aws_iam.Policy(this, `${id}Policy`, { statements }))
    return role
  }
}
