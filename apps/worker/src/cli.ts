import { readFileSync } from "node:fs";
import { createDb } from "@platform/database";
import { runBackfill } from "./commands/backfill.js";
import { runImportConnections } from "./commands/import-connections.js";
import { runImportCsv } from "./commands/import-csv.js";
import { runInsights } from "./commands/insights.js";
import { runSyncCommand } from "./commands/sync.js";
import { requireEnv } from "./env.js";

const USAGE = `usage: worker <command>

commands:
  sync                 Pull accounts + transactions from Plaid into platform.*
  insights             Compute metrics, derive events, persist both
  import-connections   Copy public.plaid_items -> platform.provider_connections (cursor NULL)
  import-csv <file>    Import an Apple Card statement CSV
  backfill             Copy legacy public.* rows into platform.* with reconciliation
`;

async function main(): Promise<number> {
  const [, , command, ...args] = process.argv;
  if (command === undefined) {
    process.stderr.write(USAGE);
    return 2;
  }

  const db = createDb(requireEnv("DATABASE_URL"), { max: 3 });

  switch (command) {
    case "sync": {
      const reports = await runSyncCommand(db);
      console.log(JSON.stringify({ reports }, null, 2));
      return reports.some((r) => r.status === "error") ? 1 : 0;
    }
    case "insights": {
      const summary = await runInsights(db);
      console.log(JSON.stringify(summary, null, 2));
      return 0;
    }
    case "import-connections": {
      const result = await runImportConnections(db);
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }
    case "import-csv": {
      const file = args[0];
      if (file === undefined) {
        process.stderr.write("usage: worker import-csv <file>\n");
        return 2;
      }
      const result = await runImportCsv(db, readFileSync(file, "utf8"));
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }
    case "backfill": {
      const result = await runBackfill(db);
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }
    default:
      process.stderr.write(USAGE);
      return 2;
  }
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
