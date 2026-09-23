import * as cdk from 'aws-cdk-lib'
import { Match, Template } from 'aws-cdk-lib/assertions'
import * as aws_dynamo from 'aws-cdk-lib/aws-dynamodb'
import {
  BACKEND_ACCOUNTS,
  BACKEND_ROLE_NAME_PATTERNS,
  crossAccountRoleName,
  IamStack,
  ORDERS_WRITE_ACTIONS,
  SHADOW_READ_ACTIONS,
  STREAM_READ_ACTIONS,
} from '../../../bin/stacks/iam-stack'
import { STAGE } from '../../../lib/util/stage'

function buildTemplate(stage: STAGE): Template {
  const app = new cdk.App()
  const parent = new cdk.Stack(app, 'TestParent')
  const table = (id: string, name: string) =>
    new aws_dynamo.Table(parent, id, {
      tableName: name,
      partitionKey: { name: 'orderHash', type: aws_dynamo.AttributeType.STRING },
      stream: aws_dynamo.StreamViewType.NEW_IMAGE,
    })
  const stack = new IamStack(parent, 'TestIamStack', {
    stage,
    ordersTable: table('Orders', 'Orders'),
    limitOrdersTable: table('LimitOrders', 'LimitOrders'),
  })
  return Template.fromStack(stack)
}

type Statement = {
  Effect: string
  Action: string | string[]
  Resource: unknown
  Principal?: { AWS?: unknown }
  Condition?: Record<string, Record<string, unknown>>
}

function statementsOf(template: Template, logicalIdPattern: RegExp): Statement[] {
  const policies = template.findResources('AWS::IAM::Policy')
  const matching = Object.entries(policies).filter(([id]) => logicalIdPattern.test(id))
  expect(matching).toHaveLength(1)
  return matching[0][1].Properties.PolicyDocument.Statement as Statement[]
}

function expectedPrincipalArns(account: string): string[] {
  return BACKEND_ROLE_NAME_PATTERNS.map((pattern) => `arn:aws:iam::${account}:role/${pattern}`)
}

function actionsOf(statements: Statement[]): string[] {
  return statements.flatMap((s) => (Array.isArray(s.Action) ? s.Action : [s.Action])).sort()
}

describe('IamStack', () => {
  const prod = buildTemplate(STAGE.PROD)

  it('creates exactly the two roles the backend service assumes, with stable names', () => {
    prod.resourceCountIs('AWS::IAM::Role', 2)
    prod.hasResourceProperties('AWS::IAM::Role', { RoleName: crossAccountRoleName(STAGE.PROD, 'shadow-read') })
    prod.hasResourceProperties('AWS::IAM::Role', { RoleName: crossAccountRoleName(STAGE.PROD, 'orders-write') })
    expect(crossAccountRoleName(STAGE.PROD, 'shadow-read')).toEqual('uniswapx-shadow-read-prod')
    expect(crossAccountRoleName(STAGE.BETA, 'orders-write')).toEqual('uniswapx-orders-write-beta')
  })

  it('lets only the uniswapx ECS task role in the stage-matched backend account assume either role', () => {
    expect(BACKEND_ACCOUNTS[STAGE.PROD]).toEqual(['654200013602'])
    for (const role of Object.values(prod.findResources('AWS::IAM::Role'))) {
      const statements = role.Properties.AssumeRolePolicyDocument.Statement as Statement[]
      expect(statements).toHaveLength(1)
      const [trust] = statements
      expect(trust.Action).toEqual('sts:AssumeRole')
      expect(trust.Effect).toEqual('Allow')
      // Account root as principal, narrowed to the service's own task roles by name.
      expect(JSON.stringify(trust.Principal?.AWS)).toContain(':654200013602:root')
      expect(trust.Condition).toEqual({
        ArnLike: { 'aws:PrincipalArn': expectedPrincipalArns('654200013602') },
      })
    }
  })

  it('beta trusts the backend dev and staging accounts, each pinned to its own task role pattern, never prod', () => {
    const beta = buildTemplate(STAGE.BETA)
    expect(BACKEND_ACCOUNTS[STAGE.BETA]).toEqual(['411170392337', '413367642260'])
    for (const role of Object.values(beta.findResources('AWS::IAM::Role'))) {
      const statements = role.Properties.AssumeRolePolicyDocument.Statement as Statement[]
      expect(statements).toHaveLength(2)
      const seen = statements.map((trust) => {
        const principal = JSON.stringify(trust.Principal?.AWS)
        const account = (principal.match(/:(\d{12}):root/) as RegExpMatchArray)[1]
        // The condition on each statement names only the account that statement trusts.
        expect(trust.Condition).toEqual({
          ArnLike: { 'aws:PrincipalArn': expectedPrincipalArns(account) },
        })
        return account
      })
      expect(seen.sort()).toEqual(['411170392337', '413367642260'])
      expect(JSON.stringify(role)).not.toContain('654200013602')
    }
  })

  it('shadow-read: table reads on Orders + LimitOrders + indexes, stream reads on their streams, nothing else', () => {
    const statements = statementsOf(prod, /ShadowRead/)
    expect(actionsOf(statements)).toEqual([...SHADOW_READ_ACTIONS, ...STREAM_READ_ACTIONS].sort())
    const tableStmt = statements.find((s) => (s.Action as string[]).includes('dynamodb:Query'))
    const streamStmt = statements.find((s) => (s.Action as string[]).includes('dynamodb:GetRecords'))
    expect(tableStmt).toBeDefined()
    expect(streamStmt).toBeDefined()
    // Table statement: each table ARN plus its index wildcard, i.e. four resources.
    expect(tableStmt?.Resource).toHaveLength(4)
    expect(JSON.stringify(tableStmt?.Resource)).toContain('/index/*')
    // Stream statement: the two stream ARNs only.
    expect(streamStmt?.Resource).toHaveLength(2)
    expect(JSON.stringify(streamStmt?.Resource)).toContain('StreamArn')
  })

  it('orders-write: conditional writes plus the reads needed to make them, no Delete and no Scan', () => {
    const statements = statementsOf(prod, /OrdersWrite/)
    expect(actionsOf(statements)).toEqual([...ORDERS_WRITE_ACTIONS].sort())
    expect(statements).toHaveLength(1)
    expect(statements[0].Resource).toHaveLength(4)
  })

  it('grants no Delete, Scan, BatchWrite, or table-management action on either role', () => {
    const all = Object.values(prod.findResources('AWS::IAM::Policy')).flatMap(
      (p) => p.Properties.PolicyDocument.Statement as Statement[]
    )
    const forbidden = /dynamodb:(DeleteItem|Scan|BatchWriteItem|CreateTable|DeleteTable|UpdateTable|PutResourcePolicy)/
    for (const action of actionsOf(all)) {
      expect(action).not.toMatch(forbidden)
    }
  })

  it('never references the Nonces table', () => {
    expect(JSON.stringify(prod.toJSON())).not.toMatch(/Nonce/)
  })

  it('trusts only the service task role and the standalone task-runner role, not every uniswapx-prefixed role', () => {
    // A bare service-prefix wildcard would also admit other services, deploy/CI roles, or anything
    // someone names with the prefix, and would bypass the backend side's cutover flag on the write role.
    // Two exact role families are admitted: the long-running service task and the one-off task runner
    // (backend `createTaskExecutionInfrastructure`) that runs the Orders/LimitOrders backfill.
    expect(BACKEND_ROLE_NAME_PATTERNS).toEqual(['uniswapx-ecsTaskRole-*', 'uniswapx-ecsTaskRunnerTaskRole-*'])
    for (const role of Object.values(prod.findResources('AWS::IAM::Role'))) {
      const [trust] = role.Properties.AssumeRolePolicyDocument.Statement as Statement[]
      const arns = trust.Condition?.ArnLike['aws:PrincipalArn'] as string[]
      expect(arns).toHaveLength(2)
      for (const arn of arns) {
        expect(arn).toMatch(/^arn:aws:iam::654200013602:role\/uniswapx-ecsTask(Runner)?(Task)?Role-\*$/)
        expect(arn).not.toMatch(/role\/uniswapx-\*$/)
      }
    }
  })

  it('refuses to be created for a stage with no backend accounts (an empty nested stack fails to deploy)', () => {
    expect(BACKEND_ACCOUNTS[STAGE.LOCAL]).toEqual([])
    expect(() => buildTemplate(STAGE.LOCAL)).toThrow(/no backend accounts to trust/)
  })

  it('exports the role ARNs so the backend side can pin them', () => {
    prod.hasOutput('ShadowReadRoleArn', Match.anyValue())
    prod.hasOutput('OrdersWriteRoleArn', Match.anyValue())
  })
})
