import * as cdk from 'aws-cdk-lib'
import * as aws_iam from 'aws-cdk-lib/aws-iam'
import * as aws_s3 from 'aws-cdk-lib/aws-s3'
import * as cr from 'aws-cdk-lib/custom-resources'
import { Construct } from 'constructs'
import { CHAIN_OWNERS_KEY, chainOwnersBucketName } from '../../lib/chain-owners/location'
import type { ChainOwnersFile } from '../../lib/chain-owners/owners'

// What the file holds when it is first created: every chain on legacy.
export function initialChainOwners(chainIds: readonly number[]): ChainOwnersFile {
  return {
    chains: Object.fromEntries(
      chainIds.map((chainId) => [chainId.toString(), { posting: 'legacy', tracking: 'legacy' }])
    ),
  }
}

export interface ChainOwnersFileProps {
  // Chains written to the file when it is created; chains added later are legacy until listed.
  chainIds: readonly number[]
}

/**
 * The chain owner file (lib/chain-owners/owners.ts): a versioned bucket in this account holding
 * one object. CDK creates the object once and never touches it again; flips are made by hand
 * (see CLAUDE.md), so a deploy can never undo one. Version history is the audit log and the
 * rollback.
 */
export class ChainOwnersFileConstruct extends Construct {
  public readonly bucket: aws_s3.Bucket

  constructor(scope: Construct, id: string, props: ChainOwnersFileProps) {
    super(scope, id)

    this.bucket = new aws_s3.Bucket(this, 'Bucket', {
      bucketName: chainOwnersBucketName(cdk.Stack.of(this).account),
      versioned: true,
      blockPublicAccess: aws_s3.BlockPublicAccess.BLOCK_ALL,
      // S3-managed keys, so the cross-account readers need no KMS grant.
      encryption: aws_s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    })

    // Create-only: IfNoneMatch makes the put fail rather than overwrite a file that already
    // exists, so even a replaced custom resource can't reset live owners to their first state.
    const seed = new cr.AwsCustomResource(this, 'Seed', {
      onCreate: {
        service: 'S3',
        action: 'putObject',
        parameters: {
          Bucket: this.bucket.bucketName,
          Key: CHAIN_OWNERS_KEY,
          Body: JSON.stringify(initialChainOwners(props.chainIds), null, 2),
          ContentType: 'application/json',
          IfNoneMatch: '*',
        },
        physicalResourceId: cr.PhysicalResourceId.of(`${CHAIN_OWNERS_KEY}-seed`),
        ignoreErrorCodesMatching: 'PreconditionFailed',
      },
      policy: cr.AwsCustomResourcePolicy.fromStatements([
        new aws_iam.PolicyStatement({
          actions: ['s3:PutObject'],
          resources: [this.bucket.arnForObjects(CHAIN_OWNERS_KEY)],
        }),
      ]),
      installLatestAwsSdk: false,
    })
    seed.node.addDependency(this.bucket)
  }

  /** GetObject on the file and nothing else in the bucket. */
  grantRead(grantee: aws_iam.IGrantable): void {
    aws_iam.Grant.addToPrincipal({
      grantee,
      actions: ['s3:GetObject'],
      resourceArns: [this.bucket.arnForObjects(CHAIN_OWNERS_KEY)],
    })
  }
}
