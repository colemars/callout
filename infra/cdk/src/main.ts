import { App } from "aws-cdk-lib";
import { PlatformApiStack } from "./api-stack.js";
import { GithubOidcStack } from "./oidc-stack.js";

const app = new App();

// us-west-2: same region as the Supabase project — the API's latency budget
// is dominated by database round trips.
const env = {
  ...(process.env.CDK_DEFAULT_ACCOUNT === undefined
    ? {}
    : { account: process.env.CDK_DEFAULT_ACCOUNT }),
  region: "us-west-2",
};

new GithubOidcStack(app, "PlatformGithubOidc", { env });
new PlatformApiStack(app, "PlatformApi", { env });
