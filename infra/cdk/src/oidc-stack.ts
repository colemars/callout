import { CfnOutput, Duration, Stack, type StackProps } from "aws-cdk-lib";
import {
  OpenIdConnectPrincipal,
  OpenIdConnectProvider,
  PolicyStatement,
  Role,
} from "aws-cdk-lib/aws-iam";
import type { Construct } from "constructs";

// GitHub's unique-ID subject format (repos on the new claim format embed
// owner/repo ids): repo:OWNER@OWNER_ID/REPO@REPO_ID:ref:... Pinning the ids is
// stronger than names — immune to owner/repo name reuse — and wildcarding the
// name segment makes the trust survive repo renames (the ids never change).
const REPO_SUBJECTS = ["repo:colemars@42340374/*@1322262155:*", "repo:colemars/pennykingdom:*"];

/**
 * One-time stack (deployed from a developer machine): lets GitHub Actions on
 * colemars/pennykingdom deploy via OIDC — no long-lived AWS keys in GitHub.
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
          "token.actions.githubusercontent.com:sub": REPO_SUBJECTS,
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
