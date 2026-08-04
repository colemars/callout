import { CfnOutput, Duration, Stack, type StackProps } from "aws-cdk-lib";
import { HttpApi } from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import { Architecture, Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction, OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import type { Construct } from "constructs";

/**
 * Cheap-first API hosting (ARCHITECTURE.md amendment 2): Lambda (arm64) behind
 * an API Gateway HTTP API — scale-to-zero, ~$0/month at current traffic.
 * The ECS migration later is a Dockerfile targeting apps/api/src/server.ts
 * plus a new stack; no application code changes.
 *
 * DATABASE_URL is resolved from Secrets Manager at deploy time (the deploy
 * workflow upserts the secret from the GitHub secret) — never in the template.
 */
export class PlatformApiStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const handler = new NodejsFunction(this, "ApiHandler", {
      entry: "../../apps/api/src/lambda.ts",
      runtime: Runtime.NODEJS_22_X,
      architecture: Architecture.ARM_64,
      memorySize: 512,
      timeout: Duration.seconds(15),
      logRetention: RetentionDays.ONE_MONTH,
      bundling: {
        format: OutputFormat.ESM,
        target: "node22",
        minify: true,
        sourceMap: true,
        // Some transitive deps still call require() from ESM.
        banner: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
      },
      environment: {
        DATABASE_URL: "{{resolve:secretsmanager:platform/database-url}}",
        SUPABASE_URL: "https://hkxerogzvowkyvdifbpn.supabase.co",
        DB_POOL_MAX: "1",
        CORS_ORIGINS: "*",
        NODE_OPTIONS: "--enable-source-maps",
      },
    });

    const api = new HttpApi(this, "HttpApi", {
      apiName: "platform-api",
      defaultIntegration: new HttpLambdaIntegration("ApiIntegration", handler),
    });

    new CfnOutput(this, "ApiUrl", { value: api.apiEndpoint });
  }
}
