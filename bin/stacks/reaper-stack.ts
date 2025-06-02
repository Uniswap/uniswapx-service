import { aws_ecs, aws_iam, Stack, StackProps } from "aws-cdk-lib";
import { DockerImageAsset, Platform } from "aws-cdk-lib/aws-ecr-assets";
import { Cluster, ContainerImage } from "aws-cdk-lib/aws-ecs";
import { Construct } from "constructs";
import { SERVICE_NAME } from "../constants";

// Expect RPC_[chainId] to be set in environmentVariables
export interface ReaperStackProps extends StackProps {
  environmentVariables: { [key: string]: string };
}

export class ReaperStack extends Stack {
  public readonly logDriver: aws_ecs.AwsLogDriver;

  constructor(scope: Construct, id: string, props: ReaperStackProps) {
    super(scope, id, props);

    const { environmentVariables } = props;

    this.logDriver = new aws_ecs.AwsLogDriver({
      streamPrefix: `${SERVICE_NAME}-ReaperStack`,
    });

    const cluster = new Cluster(this, `ReaperCluster`);

    const reaperRole = new aws_iam.Role(this, `ReaperStackRole`, {
      assumedBy: new aws_iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      managedPolicies: [
        aws_iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonDynamoDBFullAccess'),
        aws_iam.ManagedPolicy.fromAwsManagedPolicyName("CloudWatchFullAccess"),
      ],
    });

    const taskDefinition = new aws_ecs.FargateTaskDefinition(
      this,
      `ReaperTask`,
      {
        taskRole: reaperRole,
        memoryLimitMiB: 1024,
        cpu: 512,
        runtimePlatform: {
          operatingSystemFamily: aws_ecs.OperatingSystemFamily.LINUX,
          cpuArchitecture: aws_ecs.CpuArchitecture.X86_64,
        },
      }
    );
    
    const image = new DockerImageAsset(this, `ReaperImage`, {
      directory: ".",
      platform: Platform.LINUX_AMD64,
      buildArgs: {
        DOCKER_BUILDKIT: "1",
      },
    });

    taskDefinition
      .addContainer(`ReaperBase`, {
        image: ContainerImage.fromDockerImageAsset(image),
        cpu: 512,
        environment: {
          ...environmentVariables,
          AWS_EMF_ENVIRONMENT: "Local",
          // update to trigger deployment
          VERSION: "2",
        },
        logging: this.logDriver,
      })

    new aws_ecs.FargateService(this, `ReaperService`, {
      cluster,
      taskDefinition,
      desiredCount: 1,
      assignPublicIp: false,
    });
  }
}
