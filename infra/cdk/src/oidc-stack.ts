import { CfnOutput, Duration, Stack, type StackProps } from "aws-cdk-lib";
import {
  OpenIdConnectPrincipal,
  OpenIdConnectProvider,
  PolicyStatement,
  Role,
} from "aws-cdk-lib/aws-iam";
import type { Construct } from "constructs";

const REPO = "colemars/callout";

/**
 * One-time stack (deployed from a developer machine): lets GitHub Actions on
 * colemars/callout deploy via OIDC — no long-lived AWS keys in GitHub.
 * The role can only assume the CDK bootstrap roles and manage platform/*
 * secrets; CloudFormation's execution role does the actual provisioning.
 */
export class GithubOidcStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const provider = new OpenIdConnectProvider(this, "GithubProvider", {
      url: "https://token.actions.githubusercontent.com",
      clientIds: ["sts.amazonaws.com"],
    });

    const role = new Role(this, "DeployRole", {
      roleName: "github-platform-deploy",
      maxSessionDuration: Duration.hours(1),
      assumedBy: new OpenIdConnectPrincipal(provider, {
        StringEquals: {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
        },
        StringLike: {
          "token.actions.githubusercontent.com:sub": `repo:${REPO}:*`,
        },
      }),
    });

    role.addToPolicy(
      new PolicyStatement({
        sid: "AssumeCdkBootstrapRoles",
        actions: ["sts:AssumeRole"],
        resources: [`arn:aws:iam::${this.account}:role/cdk-*`],
      }),
    );
    role.addToPolicy(
      new PolicyStatement({
        sid: "ManagePlatformSecrets",
        actions: [
          "secretsmanager:CreateSecret",
          "secretsmanager:PutSecretValue",
          "secretsmanager:DescribeSecret",
        ],
        resources: [`arn:aws:secretsmanager:*:${this.account}:secret:platform/*`],
      }),
    );

    new CfnOutput(this, "DeployRoleArn", { value: role.roleArn });
  }
}
