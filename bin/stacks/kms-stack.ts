import * as cdk from 'aws-cdk-lib'
import { CfnOutput, RemovalPolicy } from 'aws-cdk-lib'
import { KeySpec, KeyUsage } from 'aws-cdk-lib/aws-kms'
import { Construct } from 'constructs'

export class KmsStack extends cdk.NestedStack {
  public readonly key: cdk.aws_kms.Key

  constructor(parent: Construct, name: string) {
    super(parent, name)

    /**
     * Unless absolutely necessary, DO NOT change this construct.
     * This uses the 'Retain' DeletionPolicy, which will cause the resource to be retained
     * in the account, but orphaned from the stack if the Key construct is ever changed.
     */
    this.key = new cdk.aws_kms.Key(this, name, {
      removalPolicy: RemovalPolicy.RETAIN,
      keySpec: KeySpec.ECC_SECG_P256K1,
      keyUsage: KeyUsage.SIGN_VERIFY,
      alias: name,
    })

    new CfnOutput(this, `${name}KeyId`, {
      value: this.key.keyId,
    })
  }
}
