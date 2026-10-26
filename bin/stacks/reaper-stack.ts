import { aws_ecs, aws_iam, Stack, StackProps } from "aws-cdk-lib";
import { DockerImageAsset, Platform } from "aws-cdk-lib/aws-ecr-assets";
import { Cluster, ContainerImage } from "aws-cdk-lib/aws-ecs";
import { Construct } from "constructs";
import { buildSync } from "esbuild";
import * as fs from "fs";
import * as path from "path";
import { SERVICE_NAME } from "../constants";

const REPO_ROOT = path.join(__dirname, "../..");
let reaperBundleDir: string | undefined;

// Bundled at synth rather than in the Docker build so the image, and with it a
// Reaper redeploy, changes only when the Reaper's own code or dependencies do.
// The bundle lives under cdk.out so its source map's relative paths, and so the
// asset hash, don't depend on where the repo is checked out.
function bundleReaper(): string {
  if (reaperBundleDir) return reaperBundleDir;
  const outdir = path.join(REPO_ROOT, "cdk.out", "reaper-bundle");
  fs.rmSync(outdir, { recursive: true, force: true });
  buildSync({
    absWorkingDir: REPO_ROOT,
    entryPoints: ["lib/crons/gs-reaper/gs-reaper.ts"],
    bundle: true,
    platform: "node",
    target: "node22",
    sourcemap: true,
    outfile: path.join(outdir, "gs-reaper.js"),
    logLevel: "warning",
  });
  fs.copyFileSync(path.join(__dirname, "reaper.Dockerfile"), path.join(outdir, "Dockerfile"));
  reaperBundleDir = outdir;
  return outdir;
}

// Expect RPC_PREFIX_URL to be set in environmentVariables; the reaper calls
// getRpcUrl(chainId) which appends the chainId to it.
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
      directory: bundleReaper(),
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
          VERSION: "4",
        },
        logging: this.logDriver,
        // As PID 1, node ignores SIGTERM, so every stop waited out the 30s
        // timeout and ended in SIGKILL.
        linuxParameters: new aws_ecs.LinuxParameters(this, `ReaperLinuxParameters`, {
          initProcessEnabled: true,
        }),
      })

    new aws_ecs.FargateService(this, `ReaperService`, {
      cluster,
      taskDefinition,
      desiredCount: 1,
      assignPublicIp: false,
      circuitBreaker: {
        rollback: true,
      },
    });
  }
}
