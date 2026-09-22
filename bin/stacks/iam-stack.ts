import * as cdk from 'aws-cdk-lib'
import * as aws_dynamo from 'aws-cdk-lib/aws-dynamodb'
import * as aws_iam from 'aws-cdk-lib/aws-iam'
import { Construct } from 'constructs'
import { STAGE } from '../../lib/util/stage'

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
 * The backend service's ECS task roles are named `uniswapx-*`. They do not exist until the
 * service's first deploy, so trust is pinned to the account plus this name pattern rather than
 * to exact role ARNs. Tightening to exact ARNs after first deploy is a one-line change here.
 */
export const BACKEND_ROLE_NAME_PATTERN = 'uniswapx-*'

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

// Used after cutover: the new status tracker writes order state transitions. Every write is
// conditional on the current status, hence ConditionCheckItem. No Delete, no Scan, no batch
// writes. Revoking this role (or its trust) is an instant rollback to the legacy writer.
export const ORDERS_WRITE_ACTIONS = [
  'dynamodb:PutItem',
  'dynamodb:UpdateItem',
  'dynamodb:GetItem',
  'dynamodb:Query',
  'dynamodb:ConditionCheckItem',
] as const

export interface IamStackProps extends cdk.NestedStackProps {
  stage: STAGE
  ordersTable: aws_dynamo.ITable
  limitOrdersTable: aws_dynamo.ITable
}

/**
 * Cross-account IAM roles for the UniswapX service being built in the backend monorepo
 * (ECO-861). Two roles, scoped to Orders + LimitOrders only:
 *
 * - `uniswapx-shadow-read-<stage>`: read tables, indexes and streams (shadow comparison phase)
 * - `uniswapx-orders-write-<stage>`: conditional writes + the reads needed to make them (cutover)
 *
 * This arrangement is transitional: it exists so the status-tracking logic can move to the
 * monorepo before the tables do. It goes away with the DynamoDB migration. Nothing here touches
 * Nonces or any other table.
 */
export class IamStack extends cdk.NestedStack {
  public readonly shadowReadRole?: aws_iam.Role
  public readonly ordersWriteRole?: aws_iam.Role

  constructor(scope: Construct, name: string, props: IamStackProps) {
    super(scope, name, props)
    const { stage, ordersTable, limitOrdersTable } = props

    const accounts = BACKEND_ACCOUNTS[stage]
    if (accounts.length === 0) {
      // Local stacks have no backend counterpart to trust.
      return
    }

    const tables = [ordersTable, limitOrdersTable]
    const tableArns = tables.flatMap((t) => [t.tableArn, `${t.tableArn}/index/*`])
    const streamArns = tables.map((t) => {
      if (!t.tableStreamArn) {
        throw new Error(`${t.tableName} has no stream; the shadow comparator needs one`)
      }
      return t.tableStreamArn
    })

    this.shadowReadRole = this.createRole('ShadowRead', stage, 'shadow-read', accounts, [
      new aws_iam.PolicyStatement({ actions: [...SHADOW_READ_ACTIONS], resources: tableArns }),
      new aws_iam.PolicyStatement({ actions: [...STREAM_READ_ACTIONS], resources: streamArns }),
    ])

    this.ordersWriteRole = this.createRole('OrdersWrite', stage, 'orders-write', accounts, [
      new aws_iam.PolicyStatement({ actions: [...ORDERS_WRITE_ACTIONS], resources: tableArns }),
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
      description: `UniswapX backend-monorepo ${kind} access to Orders + LimitOrders (ECO-861, transitional)`,
    })
    role.attachInlinePolicy(new aws_iam.Policy(this, `${id}Policy`, { statements }))
    return role
  }
}
